<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\EmailNotificationModel;
use App\Models\UserModel;
use App\Config\Env;

class EmailService
{
    private EmailNotificationModel $notificationModel;
    private UserModel              $userModel;
    private string                 $driver;
    private string                 $smtpHost;
    private int                    $smtpPort;
    private string                 $smtpUser;
    private string                 $smtpPass;
    private string                 $fromEmail;
    private string                 $fromName;

    public function __construct(
        ?EmailNotificationModel $notificationModel = null,
        ?UserModel              $userModel         = null,
    ) {
        $this->notificationModel = $notificationModel ?? new EmailNotificationModel();
        $this->userModel         = $userModel         ?? new UserModel();

        $this->driver    = (string) Env::get('EMAIL_DRIVER', 'mail');
        $this->smtpHost  = (string) Env::get('SMTP_HOST', '');
        $this->smtpPort  = (int) Env::get('SMTP_PORT', 587);
        $this->smtpUser  = (string) Env::get('SMTP_USER', '');
        $this->smtpPass  = (string) Env::get('SMTP_PASS', '');
        $this->fromEmail = (string) Env::get('EMAIL_FROM', 'noreply@honeycolm.ca');
        $this->fromName  = (string) Env::get('EMAIL_FROM_NAME', 'Honeycolm');
    }

    /**
     * Queue a notification email for a user.
     * Builds the subject and body_html from the notification type and data,
     * then inserts a row in the email_notifications table.
     */
    public function queue(int $userId, string $type, array $data): int
    {
        $template = $this->buildTemplate($type, $data);

        return $this->notificationModel->insert([
            'user_id'   => $userId,
            'type'      => $type,
            'subject'   => $template['subject'],
            'body_html' => $template['body_html'],
        ]);
    }

    /**
     * Processes the pending email queue in batches.
     * Returns the number of emails successfully sent.
     */
    public function processQueue(int $batchSize = 50): int
    {
        $pending = $this->notificationModel->findPending($batchSize);
        $sent    = 0;

        foreach ($pending as $notification) {
            try {
                $success = $this->dispatch($notification);

                if ($success) {
                    $this->notificationModel->markSent((int) $notification['id']);
                    $sent++;
                } else {
                    $this->notificationModel->markFailed(
                        (int) $notification['id'],
                        'Dispatch returned false'
                    );
                }
            } catch (\Throwable $e) {
                $this->notificationModel->markFailed(
                    (int) $notification['id'],
                    $e->getMessage()
                );
            }
        }

        return $sent;
    }

    /**
     * Dispatches a single email notification.
     * Uses the configured EMAIL_DRIVER (mail or smtp).
     */
    public function dispatch(array $notification): bool
    {
        $toEmail = $notification['user_email'] ?? '';
        $toName  = $notification['user_name'] ?? '';
        $subject = $notification['subject'] ?? '';
        $body    = $notification['body_html'] ?? '';

        if (empty($toEmail)) {
            return false;
        }

        $headers  = "From: {$this->fromName} <{$this->fromEmail}>\r\n";
        $headers .= "Reply-To: {$this->fromEmail}\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

        if ($this->driver === 'smtp' && $this->smtpHost !== '') {
            $headers .= "X-SMTP-Host: {$this->smtpHost}\r\n";
            $headers .= "X-SMTP-Port: {$this->smtpPort}\r\n";

            ini_set('SMTP', $this->smtpHost);
            ini_set('smtp_port', (string) $this->smtpPort);
        }

        return @mail($toEmail, $subject, $body, $headers);
    }

    /**
     * Build the email template for a given notification type.
     *
     * @return array{subject: string, body_html: string}
     */
    public function buildTemplate(string $type, array $data): array
    {
        return match ($type) {
            'swarm_launch'       => $this->buildSwarmLaunchEmail($data),
            'filling_warning'    => $this->buildFillingWarningEmail($data),
            'win_confirmation'   => $this->buildWinConfirmationEmail($data),
            'refund_notice'      => $this->buildRefundNoticeEmail($data),
            'withdrawal_update'  => $this->buildWithdrawalUpdateEmail($data),
            default              => ['subject' => 'Honeycolm Notification', 'body_html' => ''],
        };
    }

    // -------------------------------------------------------------------------
    // Private template builders
    // -------------------------------------------------------------------------

    private function buildSwarmLaunchEmail(array $data): array
    {
        $title    = htmlspecialchars($data['swarm_title'] ?? 'a new Swarm', ENT_QUOTES, 'UTF-8');
        $url      = htmlspecialchars($data['swarm_url'] ?? '#', ENT_QUOTES, 'UTF-8');
        $price    = htmlspecialchars($data['comb_price'] ?? '', ENT_QUOTES, 'UTF-8');

        $priceLine = $price !== '' ? "<p>Combs start at Nt {$price} each.</p>" : '';

        $body = $this->wrapEmailHtml(
            "A new Swarm just launched!",
            "<p>A new Swarm just dropped: <strong>{$title}</strong>.</p>
             {$priceLine}
             <p>The Hive is already buzzing. Grab your Combs before this one fills.</p>
             <p><a href=\"{$url}\" style=\"display:inline-block;padding:12px 24px;background:#F5A623;color:#1A1A2E;text-decoration:none;border-radius:6px;font-weight:bold;\">Enter the Swarm</a></p>"
        );

        return [
            'subject'   => 'A new Swarm just launched!',
            'body_html' => $body,
        ];
    }

    private function buildFillingWarningEmail(array $data): array
    {
        $title     = htmlspecialchars($data['swarm_title'] ?? 'this Swarm', ENT_QUOTES, 'UTF-8');
        $remaining = (int) ($data['combs_remaining'] ?? 0);
        $url       = htmlspecialchars($data['swarm_url'] ?? '#', ENT_QUOTES, 'UTF-8');

        $body = $this->wrapEmailHtml(
            "This Swarm is filling fast",
            "<p><strong>{$title}</strong> is filling fast &mdash; only {$remaining} Combs left.</p>
             <p>The Hive is moving quickly on this one. Don't miss your chance.</p>
             <p><a href=\"{$url}\" style=\"display:inline-block;padding:12px 24px;background:#F5A623;color:#1A1A2E;text-decoration:none;border-radius:6px;font-weight:bold;\">View Swarm</a></p>"
        );

        return [
            'subject'   => "This Swarm is filling fast \xe2\x80\x94 Combs left: {$remaining}",
            'body_html' => $body,
        ];
    }

    private function buildWinConfirmationEmail(array $data): array
    {
        $winnerName = htmlspecialchars($data['winner_name'] ?? 'there', ENT_QUOTES, 'UTF-8');
        $itemName   = htmlspecialchars($data['item_name'] ?? 'the honey', ENT_QUOTES, 'UTF-8');
        $verifyUrl  = htmlspecialchars($data['random_org_verify_url'] ?? '', ENT_QUOTES, 'UTF-8');
        $combNumber = (int) ($data['winning_comb_number'] ?? 0);

        $verifyLine = $verifyUrl !== ''
            ? "<p>The draw was verified by Random.org. <a href=\"{$verifyUrl}\">View the verification</a>.</p>"
            : '';

        $body = $this->wrapEmailHtml(
            "You won the honey!",
            "<p>Congratulations, {$winnerName}!</p>
             <p>The Hive has spoken and your Comb #{$combNumber} was selected. You are taking home <strong>{$itemName}</strong>.</p>
             {$verifyLine}
             <p>We will be in touch with shipping details shortly. Welcome to the winner's circle.</p>"
        );

        return [
            'subject'   => 'You won the honey!',
            'body_html' => $body,
        ];
    }

    private function buildRefundNoticeEmail(array $data): array
    {
        $title  = htmlspecialchars($data['swarm_title'] ?? 'a Swarm', ENT_QUOTES, 'UTF-8');
        $amount = htmlspecialchars($data['refund_amount'] ?? '0', ENT_QUOTES, 'UTF-8');

        $body = $this->wrapEmailHtml(
            "Your Nectar has been returned",
            "<p>The Swarm <strong>{$title}</strong> didn't fill before its deadline.</p>
             <p>Your Nt {$amount} has been returned to your balance automatically.</p>
             <p>No action needed on your end. Your balance is ready for the next Swarm.</p>"
        );

        return [
            'subject'   => 'Your Nectar has been returned',
            'body_html' => $body,
        ];
    }

    private function buildWithdrawalUpdateEmail(array $data): array
    {
        $status = htmlspecialchars($data['status'] ?? 'updated', ENT_QUOTES, 'UTF-8');
        $amount = htmlspecialchars($data['amount'] ?? '0', ENT_QUOTES, 'UTF-8');

        $body = $this->wrapEmailHtml(
            "Withdrawal update",
            "<p>Your withdrawal request for Nt {$amount} has been <strong>{$status}</strong>.</p>
             <p>If you have any questions, reach out to our support team.</p>"
        );

        return [
            'subject'   => 'Your withdrawal request has been updated',
            'body_html' => $body,
        ];
    }

    /**
     * Wraps email content in a brand-consistent HTML email template.
     */
    private function wrapEmailHtml(string $heading, string $content): string
    {
        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:Inter,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1A1A2E;padding:24px;text-align:center;">
    <span style="color:#F5A623;font-size:24px;font-weight:bold;">Honeycolm</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="color:#1A1A2E;font-size:22px;margin:0 0 16px;">{$heading}</h1>
    <div style="color:#333;font-size:16px;line-height:1.6;">{$content}</div>
  </td></tr>
  <tr><td style="background:#F5F5F0;padding:16px;text-align:center;color:#999;font-size:12px;">
    Honeycolm &mdash; The hive pools together. One lucky bee takes home the honey.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
HTML;
    }
}
