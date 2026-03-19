<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Models\UserModel;
use App\Models\CombModel;
use App\Models\SwarmModel;
use App\Models\DrawModel;
use App\Exceptions\ValidationException;

class AccountController extends BaseController
{
    private UserModel $userModel;
    private CombModel $combModel;
    private SwarmModel $swarmModel;
    private DrawModel $drawModel;

    public function __construct()
    {
        $this->userModel  = new UserModel();
        $this->combModel  = new CombModel();
        $this->swarmModel = new SwarmModel();
        $this->drawModel  = new DrawModel();
    }

    /**
     * GET /account/swarms
     * Returns the authenticated member's entered swarms with combs held and live odds.
     */
    public function mySwarms(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;

            $rows = $this->combModel->findSwarmsByUser($userId);

            // Compute live odds per swarm
            $swarms = array_map(function (array $row) {
                $combCount = (int) $row['comb_count'];
                $combsHeld = (int) $row['combs_held'];
                $row['member_odds'] = $combCount > 0
                    ? round(($combsHeld / $combCount) * 100, 2)
                    : 0;
                return $row;
            }, $rows);

            $this->success($swarms);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /account/wins
     * Returns the authenticated member's win history.
     */
    public function myWins(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;

            $wins = $this->drawModel->findByWinner($userId);

            $this->success($wins);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /account/profile
     * Returns the authenticated member's profile data.
     */
    public function profile(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;
            $user   = $this->userModel->findById($userId);

            $this->success($this->userModel->publicFields($user));
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PUT /account/profile
     * Updates the authenticated member's name and/or email.
     */
    public function updateProfile(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;
            $body   = $this->body();
            $errors = [];

            $data = [];

            if (isset($body['name'])) {
                $name = trim($body['name']);
                if (strlen($name) < 2 || strlen($name) > 100) {
                    $errors['name'] = 'Name must be between 2 and 100 characters.';
                } else {
                    $data['name'] = $name;
                }
            }

            if (isset($body['email'])) {
                $email = trim($body['email']);
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $errors['email'] = 'Invalid email address.';
                } else {
                    // Check uniqueness (exclude current user)
                    $existing = $this->userModel->findByEmail($email);
                    if ($existing && (int) $existing['id'] !== $userId) {
                        $errors['email'] = 'This email is already in use.';
                    } else {
                        $data['email'] = $email;
                    }
                }
            }

            if (!empty($errors)) {
                throw new ValidationException('Validation failed', $errors);
            }

            if (empty($data)) {
                throw new ValidationException('No fields to update', ['general' => 'Provide name or email to update.']);
            }

            $this->userModel->update($userId, $data);
            $user = $this->userModel->findById($userId);

            $this->success($this->userModel->publicFields($user), 'Profile updated.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PUT /account/password
     * Changes the authenticated member's password.
     */
    public function updatePassword(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;
            $body   = $this->body();
            $errors = [];

            $current = $body['current_password'] ?? '';
            $newPass = $body['new_password'] ?? '';
            $confirm = $body['confirm_password'] ?? '';

            if (empty($current)) {
                $errors['current_password'] = 'Current password is required.';
            }
            if (strlen($newPass) < 8) {
                $errors['new_password'] = 'New password must be at least 8 characters.';
            }
            if ($newPass !== $confirm) {
                $errors['confirm_password'] = 'Passwords do not match.';
            }

            if (!empty($errors)) {
                throw new ValidationException('Validation failed', $errors);
            }

            // Verify current password
            $user = $this->userModel->findById($userId);
            if (!password_verify($current, $user['password_hash'])) {
                throw new ValidationException('Validation failed', ['current_password' => 'Current password is incorrect.']);
            }

            $this->userModel->updatePassword($userId, password_hash($newPass, PASSWORD_BCRYPT));

            $this->success(null, 'Password updated successfully.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
