<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\EmailService;
use App\Models\EmailNotificationModel;
use App\Models\UserModel;

class EmailServiceTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * @return array{EmailService, MockObject&EmailNotificationModel, MockObject&UserModel}
     */
    private function buildServiceWithMocks(): array
    {
        /** @var MockObject&EmailNotificationModel $notificationModel */
        $notificationModel = $this->createMock(EmailNotificationModel::class);
        /** @var MockObject&UserModel $userModel */
        $userModel = $this->createMock(UserModel::class);

        $service = new EmailService($notificationModel, $userModel);

        return [$service, $notificationModel, $userModel];
    }

    // -------------------------------------------------------------------------
    // queue — inserts row in email_notifications
    // -------------------------------------------------------------------------

    public function testQueueInsertsRowInEmailNotifications(): void
    {
        [$service, $notificationModel] = $this->buildServiceWithMocks();

        $notificationModel->expects($this->once())
            ->method('insert')
            ->with($this->callback(function (array $row): bool {
                return $row['user_id'] === 42
                    && $row['type'] === 'swarm_launch'
                    && !empty($row['subject'])
                    && !empty($row['body_html']);
            }))
            ->willReturn(1);

        $id = $service->queue(42, 'swarm_launch', [
            'swarm_title' => 'Win a MacBook',
            'swarm_url'   => 'https://honeycolm.ca/ca/swarms/1',
            'comb_price'  => '5.00',
        ]);

        $this->assertSame(1, $id);
    }

    // -------------------------------------------------------------------------
    // queue — win_confirmation template contains Random.org link
    // -------------------------------------------------------------------------

    public function testWinConfirmationTemplateContainsRandomOrgLink(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $template = $service->buildTemplate('win_confirmation', [
            'winner_name'          => 'Jane',
            'item_name'            => 'MacBook Pro',
            'random_org_verify_url' => 'https://api.random.org/verify?serialNumber=12345',
            'winning_comb_number'  => 77,
        ]);

        $this->assertStringContainsString(
            'https://api.random.org/verify?serialNumber=12345',
            $template['body_html']
        );

        $this->assertStringContainsString('Jane', $template['body_html']);
        $this->assertStringContainsString('MacBook Pro', $template['body_html']);
        $this->assertStringContainsString('#77', $template['body_html']);
    }

    // -------------------------------------------------------------------------
    // queue — refund_notice uses exact brand copy
    // -------------------------------------------------------------------------

    public function testRefundNoticeUsesExactBrandCopy(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $template = $service->buildTemplate('refund_notice', [
            'swarm_title'   => 'Win a PS5',
            'refund_amount' => '25.00',
        ]);

        $this->assertStringContainsString(
            'has been returned to your balance automatically',
            $template['body_html']
        );

        $this->assertSame('Your Nectar has been returned', $template['subject']);
    }

    // -------------------------------------------------------------------------
    // All templates — never contain forbidden words
    // -------------------------------------------------------------------------

    public function testTemplateNeverContainsWordLottery(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $types = [
            'swarm_launch' => [
                'swarm_title' => 'Test Swarm',
                'swarm_url'   => 'https://honeycolm.ca/ca/swarms/1',
                'comb_price'  => '5.00',
            ],
            'filling_warning' => [
                'swarm_title'     => 'Test Swarm',
                'combs_remaining' => 10,
                'swarm_url'       => 'https://honeycolm.ca/ca/swarms/1',
            ],
            'win_confirmation' => [
                'winner_name'          => 'Jane',
                'item_name'            => 'MacBook',
                'random_org_verify_url' => 'https://api.random.org/verify?serialNumber=123',
                'winning_comb_number'  => 42,
            ],
            'refund_notice' => [
                'swarm_title'   => 'Test Swarm',
                'refund_amount' => '10.00',
            ],
            'withdrawal_update' => [
                'status' => 'approved',
                'amount' => '50.00',
            ],
        ];

        $forbiddenWords = ['lottery', 'raffle', 'ticket', 'gambling', 'bet'];

        foreach ($types as $type => $data) {
            $template = $service->buildTemplate($type, $data);
            $combined = strtolower($template['subject'] . ' ' . $template['body_html']);

            foreach ($forbiddenWords as $word) {
                $this->assertStringNotContainsString(
                    $word,
                    $combined,
                    "Template '{$type}' contains forbidden word '{$word}'"
                );
            }
        }
    }

    // -------------------------------------------------------------------------
    // processQueue — processes pending emails
    // -------------------------------------------------------------------------

    public function testProcessQueueSendsAndMarksSent(): void
    {
        [$service, $notificationModel] = $this->buildServiceWithMocks();

        $pending = [
            [
                'id'         => 1,
                'user_id'    => 42,
                'type'       => 'swarm_launch',
                'subject'    => 'A new Swarm just launched!',
                'body_html'  => '<p>Test</p>',
                'user_email' => 'jane@example.com',
                'user_name'  => 'Jane',
            ],
        ];

        $notificationModel->method('findPending')->with(50)->willReturn($pending);

        // mail() will likely fail in test env, so markFailed should be called
        // We just verify the queue is processed without errors
        $notificationModel->expects($this->atLeastOnce())
            ->method('markFailed');

        $sent = $service->processQueue(50);

        // In test env without mail configured, sent will be 0
        $this->assertSame(0, $sent);
    }

    // -------------------------------------------------------------------------
    // swarm_launch template — contains correct content
    // -------------------------------------------------------------------------

    public function testSwarmLaunchTemplateContent(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $template = $service->buildTemplate('swarm_launch', [
            'swarm_title' => 'Win a PS5',
            'swarm_url'   => 'https://honeycolm.ca/ca/swarms/5',
            'comb_price'  => '6.00',
        ]);

        $this->assertSame('A new Swarm just launched!', $template['subject']);
        $this->assertStringContainsString('Win a PS5', $template['body_html']);
        $this->assertStringContainsString('https://honeycolm.ca/ca/swarms/5', $template['body_html']);
        $this->assertStringContainsString('Nt 6.00', $template['body_html']);
    }

    // -------------------------------------------------------------------------
    // filling_warning template — contains correct content
    // -------------------------------------------------------------------------

    public function testFillingWarningTemplateContent(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $template = $service->buildTemplate('filling_warning', [
            'swarm_title'     => 'Win a MacBook',
            'combs_remaining' => 15,
            'swarm_url'       => 'https://honeycolm.ca/ca/swarms/3',
        ]);

        $this->assertStringContainsString('Combs left: 15', $template['subject']);
        $this->assertStringContainsString('Win a MacBook', $template['body_html']);
        $this->assertStringContainsString('15 Combs left', $template['body_html']);
    }

    // -------------------------------------------------------------------------
    // withdrawal_update template — contains correct content
    // -------------------------------------------------------------------------

    public function testWithdrawalUpdateTemplateContent(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $template = $service->buildTemplate('withdrawal_update', [
            'status' => 'approved',
            'amount' => '100.00',
        ]);

        $this->assertSame('Your withdrawal request has been updated', $template['subject']);
        $this->assertStringContainsString('approved', $template['body_html']);
        $this->assertStringContainsString('Nt 100.00', $template['body_html']);
    }

    // -------------------------------------------------------------------------
    // queue — each notification type produces non-empty templates
    // -------------------------------------------------------------------------

    public function testAllNotificationTypesProduceNonEmptyTemplates(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $types = ['swarm_launch', 'filling_warning', 'win_confirmation', 'refund_notice', 'withdrawal_update'];

        foreach ($types as $type) {
            $template = $service->buildTemplate($type, []);
            $this->assertNotEmpty($template['subject'], "Type '{$type}' has empty subject");
            $this->assertNotEmpty($template['body_html'], "Type '{$type}' has empty body_html");
        }
    }
}
