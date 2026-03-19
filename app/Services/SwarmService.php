<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SwarmModel;
use App\Models\CombModel;
use App\Models\UserModel;
use App\Models\ProductModel;
use App\Config\Database;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;

class SwarmService
{
    private SwarmModel   $swarmModel;
    private CombModel    $combModel;
    private UserModel    $userModel;
    private ProductModel $productModel;
    private WalletService $walletService;

    public function __construct(
        ?SwarmModel    $swarmModel    = null,
        ?CombModel     $combModel     = null,
        ?UserModel     $userModel     = null,
        ?ProductModel  $productModel  = null,
        ?WalletService $walletService = null,
    ) {
        $this->swarmModel    = $swarmModel    ?? new SwarmModel();
        $this->combModel     = $combModel     ?? new CombModel();
        $this->userModel     = $userModel     ?? new UserModel();
        $this->productModel  = $productModel  ?? new ProductModel();
        $this->walletService = $walletService ?? new WalletService();
    }

    // -------------------------------------------------------------------------
    // Admin — create
    // -------------------------------------------------------------------------

    /**
     * Creates a new Swarm in 'draft' status.
     *
     * @throws ValidationException
     * @throws NotFoundException   when the product does not exist
     */
    public function create(array $data, int $adminStaffId): array
    {
        $this->validateSwarmData($data);

        // Verify product exists
        $this->productModel->findById((int) $data['product_id']);

        $swarmId = $this->swarmModel->insert([
            'product_id'             => (int) $data['product_id'],
            'region_id'              => $data['region_id'],
            'title'                  => trim($data['title']),
            'status'                 => 'draft',
            'swarm_type'             => $data['swarm_type'] ?? 'standard',
            'comb_count'             => (int) $data['comb_count'],
            'combs_sold'             => 0,
            'comb_price'             => (float) $data['comb_price'],
            'per_member_comb_limit'  => isset($data['per_member_comb_limit']) ? (int) $data['per_member_comb_limit'] : null,
            'filling_fast_threshold' => isset($data['filling_fast_threshold']) ? (int) $data['filling_fast_threshold'] : 20,
            'deadline'               => $data['deadline'],
            'created_by'             => $adminStaffId,
        ]);

        $this->productModel->incrementTimesUsed((int) $data['product_id']);

        return $this->swarmModel->findById($swarmId);
    }

    // -------------------------------------------------------------------------
    // Admin — publish
    // -------------------------------------------------------------------------

    /**
     * Transitions a Swarm from 'draft' to 'active' and sets published_at.
     *
     * @throws ValidationException when swarm is not in 'draft' status
     * @throws NotFoundException   when swarm not found
     */
    public function publish(int $swarmId): array
    {
        $swarm = $this->swarmModel->findById($swarmId);

        if ($swarm['status'] !== 'draft') {
            throw new ValidationException(['status' => 'Only draft Swarms can be published.']);
        }

        $this->swarmModel->transitionStatus($swarmId, 'active');

        return $this->swarmModel->findById($swarmId);
    }

    // -------------------------------------------------------------------------
    // Admin — cancel
    // -------------------------------------------------------------------------

    /**
     * Cancels a Swarm. Refund processing is handled by Task 10.
     *
     * @throws ValidationException when swarm is in a non-cancellable status
     * @throws NotFoundException   when swarm not found
     */
    public function cancel(int $swarmId): array
    {
        $swarm = $this->swarmModel->findById($swarmId);

        $cancellable = ['draft', 'active', 'filling_fast'];
        if (!in_array($swarm['status'], $cancellable, true)) {
            throw new ValidationException(['status' => 'Swarm cannot be cancelled in its current status.']);
        }

        $this->swarmModel->transitionStatus($swarmId, 'cancelled');

        return $this->swarmModel->findById($swarmId);
    }

    // -------------------------------------------------------------------------
    // Admin — update
    // -------------------------------------------------------------------------

    /**
     * Updates a draft Swarm's fields.
     *
     * @throws ValidationException when swarm is not in 'draft' status
     * @throws NotFoundException   when swarm not found
     */
    public function update(int $swarmId, array $data): array
    {
        $swarm = $this->swarmModel->findById($swarmId);

        if ($swarm['status'] !== 'draft') {
            throw new ValidationException(['status' => 'Only draft Swarms can be updated.']);
        }

        $allowed = [
            'title', 'swarm_type', 'comb_count', 'comb_price',
            'per_member_comb_limit', 'filling_fast_threshold', 'deadline',
        ];

        $updateData = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $updateData[$field] = $data[$field];
            }
        }

        if (!empty($updateData)) {
            $this->swarmModel->update($swarmId, $updateData);
        }

        return $this->swarmModel->findById($swarmId);
    }

    // -------------------------------------------------------------------------
    // Member — purchase Combs
    // -------------------------------------------------------------------------

    /**
     * Purchases `$quantity` Combs in a Swarm for a member.
     *
     * This is the critical write path. Steps:
     *  (a) Fetch swarm — confirm status active/filling_fast
     *  (b) Enforce home-region lock
     *  (c) Check per-member Comb limit
     *  (d) Check available Combs
     *  (e–h) Wrap in DB transaction: deduct wallet, assign comb_numbers, insert combs, increment combs_sold
     *  (i) Check fill — transition to 'full' if combs_sold == comb_count
     *  (j) Check filling_fast threshold — transition if threshold breached
     *
     * @return array{combs_purchased: array, new_wallet_balance: array, swarm_filled: bool}
     * @throws ValidationException
     * @throws NotFoundException
     */
    public function purchaseCombs(int $userId, int $swarmId, int $quantity): array
    {
        if ($quantity < 1) {
            throw new ValidationException(['quantity' => 'Quantity must be at least 1.']);
        }

        // (a) Fetch swarm and validate status
        $swarm = $this->swarmModel->findById($swarmId);

        $purchasableStatuses = ['active', 'filling_fast'];
        if (!in_array($swarm['status'], $purchasableStatuses, true)) {
            throw new ValidationException(['swarm' => 'This Swarm is not open for purchases.']);
        }

        // (b) Enforce home-region lock
        $user = $this->userModel->findById($userId);

        if ($swarm['region_id'] !== $user['home_region']) {
            throw new ValidationException([
                'region' => 'You can only enter Swarms in your registered home region.',
            ]);
        }

        // (c) Per-member Comb limit
        $limit = isset($swarm['per_member_comb_limit']) && $swarm['per_member_comb_limit'] !== null
            ? (int) $swarm['per_member_comb_limit']
            : null;

        if ($limit !== null) {
            $alreadyHeld = $this->combModel->countByUserAndSwarm($userId, $swarmId);
            if ($alreadyHeld + $quantity > $limit) {
                throw new ValidationException([
                    'quantity' => "This Swarm limits each member to {$limit} Combs. You already hold {$alreadyHeld}.",
                ]);
            }
        }

        // (d) Check available Combs (pre-flight — the atomic UPDATE is the real guard)
        $combCount  = (int) $swarm['comb_count'];
        $combsSold  = (int) $swarm['combs_sold'];
        $remaining  = $combCount - $combsSold;

        if ($quantity > $remaining) {
            throw new ValidationException(['quantity' => 'Not enough Combs remaining.']);
        }

        // (e–h) Transactional purchase
        $db = Database::connection();

        $db->beginTransaction();

        try {
            // (e) Deduct wallet — WalletService::deduct handles deductWithLock internally
            $totalCost   = (float) $swarm['comb_price'] * $quantity;
            $deductResult = $this->walletService->deduct($userId, $totalCost, 'swarm', $swarmId);

            // (f) Assign comb_numbers
            $combNumbers = $this->combModel->getNextCombNumbers($swarmId, $quantity);

            // (g) Build comb rows with correct bucket_source per comb
            $combRows    = $this->buildCombRows(
                $userId,
                $swarmId,
                $combNumbers,
                (float) $swarm['comb_price'],
                $deductResult['deducted_bonus'],
                $deductResult['deducted_deposit']
            );

            // Insert combs
            $this->combModel->insertBatch($combRows);

            // (h) Increment combs_sold — atomic, prevents overselling
            $updatedSwarm = $this->swarmModel->incrementCombsSold($swarmId, $quantity);

            $db->commit();

        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        // (i) Check fill detection
        $newCombsSold = (int) $updatedSwarm['combs_sold'];
        $swarmFilled  = $newCombsSold === $combCount;

        if ($swarmFilled) {
            $this->swarmModel->transitionStatus($swarmId, 'full');
        } elseif ($updatedSwarm['status'] === 'active') {
            // (j) Check filling_fast threshold
            $threshold = (int) $updatedSwarm['filling_fast_threshold'];
            $remainingAfter = $combCount - $newCombsSold;
            $remainingPct   = ($remainingAfter / $combCount) * 100;

            if ($remainingPct < $threshold) {
                $this->swarmModel->transitionStatus($swarmId, 'filling_fast');
            }
        }

        // Fetch updated wallet balance
        $newBalance = $this->walletService->getBalance($userId);

        return [
            'combs_purchased'   => $combRows,
            'new_wallet_balance' => $newBalance,
            'swarm_filled'      => $swarmFilled,
        ];
    }

    // -------------------------------------------------------------------------
    // Member — read
    // -------------------------------------------------------------------------

    /**
     * Returns active/filling_fast swarms for a region.
     */
    public function getActiveSwarms(string $region, array $filters = []): array
    {
        return $this->swarmModel->findActive($region, $filters);
    }

    /**
     * Returns full swarm detail. If $userId is provided and the member holds
     * Combs, adds member_combs_held and member_odds to the response.
     *
     * @throws NotFoundException
     */
    public function getSwarmDetail(int $id, ?int $userId = null): array
    {
        $swarm = $this->swarmModel->findWithProductAndImages($id);

        if ($userId !== null) {
            $memberCombs = $this->combModel->findByUserAndSwarm($userId, $id);
            $held        = count($memberCombs);

            $swarm['member_combs_held'] = $held;
            $swarm['member_combs']      = $memberCombs;

            $combCount = (int) $swarm['comb_count'];
            $swarm['member_odds'] = ($combCount > 0 && $held > 0)
                ? round(($held / $combCount) * 100, 4)
                : 0.0;
        }

        return $swarm;
    }

    /**
     * Returns live odds for a swarm. If $userId provided and member holds Combs,
     * includes their personal odds.
     *
     * @throws NotFoundException
     */
    public function getOdds(int $swarmId, ?int $userId = null): array
    {
        $swarm     = $this->swarmModel->findById($swarmId);
        $combCount = (int) $swarm['comb_count'];
        $combsSold = (int) $swarm['combs_sold'];

        $result = [
            'swarm_id'        => $swarmId,
            'comb_count'      => $combCount,
            'combs_sold'      => $combsSold,
            'combs_remaining' => $combCount - $combsSold,
            'fill_percent'    => $combCount > 0
                ? round(($combsSold / $combCount) * 100, 2)
                : 0.0,
        ];

        if ($userId !== null) {
            $held = $this->combModel->countByUserAndSwarm($userId, $swarmId);
            $result['member_combs_held'] = $held;
            $result['member_odds']       = ($combCount > 0 && $held > 0)
                ? round(($held / $combCount) * 100, 4)
                : 0.0;
        }

        return $result;
    }

    // -------------------------------------------------------------------------
    // Admin — read
    // -------------------------------------------------------------------------

    /**
     * Returns paginated swarms for the admin panel.
     */
    public function getAdminSwarms(array $filters, int $page, int $perPage): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));

        return $this->swarmModel->findAllAdmin($filters, $page, $perPage);
    }

    /**
     * Returns full swarm detail including Comb holders, for the admin panel.
     *
     * @throws NotFoundException
     */
    public function getAdminSwarmDetail(int $id): array
    {
        $swarm          = $this->swarmModel->findWithProductAndImages($id);
        $swarm['combs'] = $this->combModel->findBySwarm($id);

        return $swarm;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Builds the comb rows array, assigning bucket_source per comb.
     * Bonus combs come first, then deposit combs.
     *
     * @param int[]  $combNumbers
     * @return array<int, array{swarm_id: int, user_id: int, comb_number: int, bucket_source: string, price_paid: float}>
     */
    private function buildCombRows(
        int   $userId,
        int   $swarmId,
        array $combNumbers,
        float $pricePerComb,
        float $deductedBonus,
        float $deductedDeposit
    ): array {
        $rows        = [];
        $bonusCombs  = $pricePerComb > 0 ? (int) round($deductedBonus / $pricePerComb) : 0;

        foreach ($combNumbers as $i => $combNumber) {
            $bucketSource = ($i < $bonusCombs) ? 'bonus' : 'deposit';

            $rows[] = [
                'swarm_id'      => $swarmId,
                'user_id'       => $userId,
                'comb_number'   => $combNumber,
                'bucket_source' => $bucketSource,
                'price_paid'    => $pricePerComb,
            ];
        }

        return $rows;
    }

    /**
     * Validates the required fields for swarm creation.
     *
     * @throws ValidationException
     */
    private function validateSwarmData(array $data): void
    {
        $errors = [];

        if (empty($data['product_id']) || !(int) $data['product_id'] > 0) {
            $errors['product_id'] = 'Product ID is required.';
        }

        if (empty($data['region_id'])) {
            $errors['region_id'] = 'Region is required.';
        }

        if (empty(trim((string) ($data['title'] ?? '')))) {
            $errors['title'] = 'Title is required.';
        }

        if (empty($data['comb_count']) || (int) $data['comb_count'] < 1) {
            $errors['comb_count'] = 'Comb count must be at least 1.';
        }

        if (!isset($data['comb_price']) || !is_numeric($data['comb_price']) || (float) $data['comb_price'] <= 0) {
            $errors['comb_price'] = 'Comb price must be a positive number.';
        }

        if (empty($data['deadline'])) {
            $errors['deadline'] = 'Deadline is required.';
        }

        if ($errors) {
            throw new ValidationException($errors);
        }
    }
}
