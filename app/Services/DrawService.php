<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\DrawModel;
use App\Models\SwarmModel;
use App\Models\CombModel;
use App\Models\UserModel;
use App\Models\PlatformSettingModel;
use App\Config\Database;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Exceptions\AppException;

class DrawService
{
    private DrawModel            $drawModel;
    private SwarmModel           $swarmModel;
    private CombModel            $combModel;
    private PlatformSettingModel $settingModel;

    public function __construct(
        ?DrawModel            $drawModel    = null,
        ?SwarmModel           $swarmModel   = null,
        ?CombModel            $combModel    = null,
        ?PlatformSettingModel $settingModel = null,
    ) {
        $this->drawModel    = $drawModel    ?? new DrawModel();
        $this->swarmModel   = $swarmModel   ?? new SwarmModel();
        $this->combModel    = $combModel    ?? new CombModel();
        $this->settingModel = $settingModel ?? new PlatformSettingModel();
    }

    /**
     * Trigger the Random.org draw for a full swarm.
     * Idempotent: if a draw already exists for this swarm, returns the existing draw.
     * Must be called inside a transaction context for safety.
     *
     * @throws ValidationException when the swarm is not full
     * @throws NotFoundException   when the swarm does not exist
     * @throws AppException        when Random.org API key is not configured or API call fails
     */
    public function triggerDraw(int $swarmId): array
    {
        // Check idempotency first
        $existingDraw = $this->drawModel->findBySwarmId($swarmId);
        if ($existingDraw !== false) {
            return $existingDraw;
        }

        // Validate swarm is full
        $swarm = $this->swarmModel->findById($swarmId);

        if ($swarm['status'] !== 'full') {
            throw new ValidationException(['swarm' => 'Draw can only be triggered for a full Swarm.']);
        }

        $combCount = (int) $swarm['comb_count'];
        $combsSold = (int) $swarm['combs_sold'];

        if ($combsSold < $combCount) {
            throw new ValidationException(['swarm' => 'Swarm is not fully sold.']);
        }

        // Get Random.org API key
        $apiKey = $this->settingModel->getValue('random_org_api_key');

        if ($apiKey === null || $apiKey === '') {
            throw new AppException('Random.org API key is not configured.');
        }

        // Call Random.org API
        $randomResult = $this->callRandomOrg($apiKey, 1, $combCount);

        $winningNumber  = $randomResult['winning_number'];
        $requestId      = $randomResult['request_id'];
        $serialNumber   = $randomResult['serial_number'];
        $rawResponse    = $randomResult['raw_response'];

        // Find the winning comb
        $winnerComb = $this->combModel->getWinnerComb($swarmId, $winningNumber);

        if ($winnerComb === false) {
            throw new AppException("Winning comb #{$winningNumber} not found in swarm #{$swarmId}.");
        }

        $verifyUrl = $this->buildRandomOrgVerifyUrl($serialNumber);

        // Insert draw in a DB transaction
        $db = Database::connection();
        $db->beginTransaction();

        try {
            $drawId = $this->drawModel->insert([
                'swarm_id'                => $swarmId,
                'winner_user_id'          => (int) $winnerComb['user_id'],
                'winner_comb_id'          => (int) $winnerComb['id'],
                'random_org_request_id'   => $requestId,
                'random_org_verify_url'   => $verifyUrl,
                'random_org_raw_response' => json_encode($rawResponse),
                'winning_number'          => $winningNumber,
                'is_published'            => 0,
            ]);

            // Transition swarm to draw_complete
            $this->swarmModel->transitionStatus($swarmId, 'draw_complete');

            $db->commit();
        } catch (\PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }

            // Check for duplicate key error (idempotency)
            if (str_contains($e->getMessage(), 'Duplicate entry') || $e->getCode() === '23000') {
                $existingDraw = $this->drawModel->findBySwarmId($swarmId);
                if ($existingDraw !== false) {
                    return $existingDraw;
                }
            }

            throw $e;
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        $draw = $this->drawModel->findById($drawId);

        // Queue win_confirmation email to the winner
        try {
            $winnerUser = (new UserModel())->findById((int) $winnerComb['user_id']);
            $product    = $swarm['title'] ?? 'the honey';

            (new EmailService())->queue((int) $winnerComb['user_id'], 'win_confirmation', [
                'winner_name'          => $winnerUser['name'] ?? '',
                'item_name'            => $product,
                'random_org_verify_url' => $verifyUrl,
                'winning_comb_number'  => $winningNumber,
            ]);
        } catch (\Throwable) {
            // Email queuing must never block the draw flow
        }

        return $draw;
    }

    /**
     * Returns the draw result for a swarm.
     *
     * @throws NotFoundException when no draw exists for the swarm
     */
    public function getDrawResult(int $swarmId): array
    {
        $draw = $this->drawModel->findBySwarmId($swarmId);

        if ($draw === false) {
            throw new NotFoundException("No draw result found for swarm #{$swarmId}.");
        }

        return $draw;
    }

    /**
     * Returns all draws with swarm info for admin listing.
     */
    public function getAdminDraws(): array
    {
        return $this->drawModel->findAllWithSwarmInfo();
    }

    /**
     * Returns draw detail for admin view.
     *
     * @throws NotFoundException
     */
    public function getAdminDrawDetail(int $swarmId): array
    {
        return $this->drawModel->findBySwarmIdWithDetails($swarmId);
    }

    /**
     * Marks a draw's swarm as shipped.
     *
     * @throws NotFoundException
     * @throws ValidationException
     */
    public function markShipped(int $swarmId): array
    {
        $draw  = $this->drawModel->findBySwarmId($swarmId);

        if ($draw === false) {
            throw new NotFoundException("No draw found for swarm #{$swarmId}.");
        }

        $swarm = $this->swarmModel->findById($swarmId);

        if ($swarm['status'] !== 'draw_complete') {
            throw new ValidationException(['status' => 'Swarm must be in draw_complete status to mark as shipped.']);
        }

        $this->swarmModel->transitionStatus($swarmId, 'shipped');

        // Update swarm shipped_at timestamp
        $this->swarmModel->update($swarmId, ['shipped_at' => date('Y-m-d H:i:s')]);

        return $this->drawModel->findBySwarmIdWithDetails($swarmId);
    }

    /**
     * Build the Random.org verification URL.
     */
    public function buildRandomOrgVerifyUrl(string $serialNumber): string
    {
        return "https://api.random.org/verify?serialNumber={$serialNumber}";
    }

    /**
     * Calls Random.org JSON-RPC v4 API to generate a random integer.
     *
     * @return array{winning_number: int, request_id: string, serial_number: string, raw_response: array}
     * @throws AppException
     */
    protected function callRandomOrg(string $apiKey, int $min, int $max): array
    {
        $requestId = bin2hex(random_bytes(16));

        $payload = [
            'jsonrpc' => '4.0',
            'method'  => 'generateSignedIntegers',
            'params'  => [
                'apiKey'      => $apiKey,
                'n'           => 1,
                'min'         => $min,
                'max'         => $max,
                'replacement' => false,
            ],
            'id' => $requestId,
        ];

        $ch = curl_init('https://api.random.org/json-rpc/4/invoke');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $curlError !== '') {
            throw new AppException("Random.org API request failed: {$curlError}");
        }

        $decoded = json_decode((string) $response, true);

        if ($decoded === null) {
            throw new AppException('Random.org API returned invalid JSON.');
        }

        if (isset($decoded['error'])) {
            $errMsg = $decoded['error']['message'] ?? 'Unknown error';
            throw new AppException("Random.org API error: {$errMsg}");
        }

        $result       = $decoded['result'] ?? [];
        $random       = $result['random'] ?? [];
        $data         = $random['data'] ?? [];
        $serialNumber = (string) ($result['serialNumber'] ?? $random['serialNumber'] ?? '');

        if (empty($data)) {
            throw new AppException('Random.org API returned no data.');
        }

        return [
            'winning_number' => (int) $data[0],
            'request_id'     => $requestId,
            'serial_number'  => $serialNumber,
            'raw_response'   => $decoded,
        ];
    }
}
