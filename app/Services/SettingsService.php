<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\PlatformSettingModel;
use App\Models\AdminStaffModel;
use App\Exceptions\ValidationException;
use App\Exceptions\ForbiddenException;
use App\Exceptions\AppException;
use App\Config\Database;
use PDO;

class SettingsService
{
    private PDO $db;

    /**
     * Maps the API-facing field name to the platform_settings.key row it
     * reads/writes. us_region_active is stored as us_market_active in the
     * database (pre-existing seed data uses that key).
     */
    private const SETTING_KEYS = [
        'us_region_active'         => 'us_market_active',
        'com_default_region'       => 'com_default_region',
        'random_org_api_key'       => 'random_org_api_key',
        'margin_warning_threshold' => 'margin_warning_threshold',
        'filling_fast_threshold'   => 'filling_fast_threshold',
    ];

    public function __construct(
        private PlatformSettingModel $settingModel = new PlatformSettingModel(),
        private AdminStaffModel      $staffModel   = new AdminStaffModel(),
        ?PDO                          $db           = null,
    ) {
        $this->db = $db ?? Database::connection();
    }

    // -------------------------------------------------------------------------
    // Platform settings
    // -------------------------------------------------------------------------

    public function getSettings(): array
    {
        $result = [];
        foreach (self::SETTING_KEYS as $apiKey => $dbKey) {
            $result[$apiKey] = $this->settingModel->getValue($dbKey);
        }

        return [
            'us_region_active'         => $result['us_region_active'] === '1',
            'com_default_region'       => $result['com_default_region'] ?? 'ca',
            'random_org_api_key'       => $result['random_org_api_key'] ?? '',
            'margin_warning_threshold' => (int) ($result['margin_warning_threshold'] ?? 15),
            'filling_fast_threshold'   => (int) ($result['filling_fast_threshold'] ?? 20),
        ];
    }

    /**
     * Upserts any of the allowed setting keys present in $data.
     *
     * @throws ValidationException
     */
    public function updateSettings(array $data): array
    {
        foreach ($data as $apiKey => $value) {
            if (!array_key_exists($apiKey, self::SETTING_KEYS)) {
                continue;
            }

            if (in_array($apiKey, ['margin_warning_threshold', 'filling_fast_threshold'], true)) {
                $intVal = (int) $value;
                if ($intVal < 1 || $intVal > 100) {
                    throw new ValidationException([$apiKey => 'Must be between 1 and 100.']);
                }
                $value = $intVal;
            }

            if ($apiKey === 'us_region_active') {
                $value = ((int) $value) === 1 || $value === true ? '1' : '0';
            }

            $dbKey = self::SETTING_KEYS[$apiKey];

            $stmt = $this->db->prepare(
                "INSERT INTO `platform_settings` (`key`, `value`) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
            );
            $stmt->execute([$dbKey, (string) $value]);
        }

        return $this->getSettings();
    }

    /**
     * Tests the configured Random.org API key using the lightweight
     * getUsage method (does not consume signed-integer quota).
     *
     * @throws ValidationException when no key is configured
     * @throws AppException        when the connection/key check fails
     */
    public function testRandomOrgConnection(): array
    {
        $apiKey = $this->settingModel->getValue('random_org_api_key');

        if (empty($apiKey)) {
            throw new ValidationException(['random_org_api_key' => 'No Random.org API key is configured.']);
        }

        $payload = [
            'jsonrpc' => '4.0',
            'method'  => 'getUsage',
            'params'  => ['apiKey' => $apiKey],
            'id'      => bin2hex(random_bytes(8)),
        ];

        $ch = curl_init('https://api.random.org/json-rpc/4/invoke');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);

        $response  = curl_exec($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $curlError !== '') {
            throw new AppException("Random.org connection failed: {$curlError}");
        }

        $decoded = json_decode((string) $response, true);

        if ($decoded === null) {
            throw new AppException('Random.org API returned invalid JSON.');
        }

        if (isset($decoded['error'])) {
            $errMsg = $decoded['error']['message'] ?? 'Unknown error';
            throw new AppException("Random.org API error: {$errMsg}");
        }

        return ['status' => $decoded['result']['status'] ?? 'ok'];
    }

    // -------------------------------------------------------------------------
    // Staff management
    // -------------------------------------------------------------------------

    public function listStaff(): array
    {
        $rows = $this->staffModel->findAll([], 'name ASC');

        return array_map(fn($row) => $this->staffModel->publicFields($row), $rows);
    }

    /**
     * Creates a new admin_staff account.
     * Only an existing super_admin may create another super_admin.
     *
     * @throws ValidationException
     * @throws ForbiddenException
     */
    public function createStaff(array $data, string $currentStaffRole): array
    {
        $errors = [];
        $name     = trim((string) ($data['name'] ?? ''));
        $email    = trim((string) ($data['email'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        $role     = (string) ($data['role'] ?? 'staff');

        if (empty($name))                                       $errors['name']     = 'Name is required.';
        if (empty($email))                                      $errors['email']    = 'Email is required.';
        if (strlen($password) < 8)                               $errors['password'] = 'Password must be at least 8 characters.';
        if (!in_array($role, ['staff', 'admin', 'super_admin'], true)) {
            $errors['role'] = 'Role must be staff, admin, or super_admin.';
        }
        if ($errors) {
            throw new ValidationException($errors);
        }

        if ($role === 'super_admin' && $currentStaffRole !== 'super_admin') {
            throw new ForbiddenException('Only a super admin can create another super admin.');
        }

        if ($this->staffModel->emailExists($email)) {
            throw new ValidationException(['email' => 'A staff member with this email already exists.']);
        }

        $id = $this->staffModel->insert([
            'name'          => $name,
            'email'         => $email,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]),
            'role'          => $role,
            'is_active'     => 1,
        ]);

        return $this->staffModel->publicFields($this->staffModel->findById($id));
    }

    /**
     * Updates an existing staff member's active status and/or role.
     * Only a super_admin may promote someone to super_admin.
     *
     * @throws ValidationException
     * @throws ForbiddenException
     */
    public function updateStaff(int $id, array $data, string $currentStaffRole): array
    {
        $updateData = [];

        if (array_key_exists('is_active', $data)) {
            $updateData['is_active'] = ((int) $data['is_active']) === 1 ? 1 : 0;
        }

        if (array_key_exists('role', $data)) {
            $role = (string) $data['role'];
            if (!in_array($role, ['staff', 'admin', 'super_admin'], true)) {
                throw new ValidationException(['role' => 'Role must be staff, admin, or super_admin.']);
            }
            if ($role === 'super_admin' && $currentStaffRole !== 'super_admin') {
                throw new ForbiddenException('Only a super admin can grant the super admin role.');
            }
            $updateData['role'] = $role;
        }

        if (!empty($updateData)) {
            $this->staffModel->update($id, $updateData);
        }

        return $this->staffModel->publicFields($this->staffModel->findById($id));
    }
}
