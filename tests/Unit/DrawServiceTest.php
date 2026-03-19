<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\DrawService;
use App\Models\DrawModel;
use App\Models\SwarmModel;
use App\Models\CombModel;
use App\Models\PlatformSettingModel;
use App\Exceptions\ValidationException;
use App\Exceptions\NotFoundException;
use App\Exceptions\AppException;

class DrawServiceTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function fakeSwarm(array $overrides = []): array
    {
        return array_merge([
            'id'         => 1,
            'title'      => 'Test Swarm',
            'region_id'  => 'ca',
            'status'     => 'full',
            'comb_count' => 100,
            'combs_sold' => 100,
            'comb_price' => 5.00,
        ], $overrides);
    }

    private function fakeDraw(array $overrides = []): array
    {
        return array_merge([
            'id'                      => 1,
            'swarm_id'                => 1,
            'winner_user_id'          => 42,
            'winner_comb_id'          => 77,
            'random_org_request_id'   => 'abc123',
            'random_org_verify_url'   => 'https://api.random.org/verify?serialNumber=serial123',
            'random_org_raw_response' => '{"result":{}}',
            'winning_number'          => 77,
            'drawn_at'                => '2026-03-19 12:00:00',
            'is_published'            => 0,
            'published_at'            => null,
        ], $overrides);
    }

    private function fakeComb(array $overrides = []): array
    {
        return array_merge([
            'id'            => 77,
            'swarm_id'      => 1,
            'user_id'       => 42,
            'comb_number'   => 77,
            'bucket_source' => 'deposit',
            'price_paid'    => 5.00,
        ], $overrides);
    }

    /**
     * Creates a testable subclass of DrawService that overrides callRandomOrg
     * to avoid hitting the real API in unit tests.
     *
     * @return DrawService
     */
    private function buildServiceWithMockedRandomOrg(
        MockObject&DrawModel $drawModel,
        MockObject&SwarmModel $swarmModel,
        MockObject&CombModel $combModel,
        MockObject&PlatformSettingModel $settingModel,
        array $randomOrgResult
    ): DrawService {
        return new class($drawModel, $swarmModel, $combModel, $settingModel, $randomOrgResult) extends DrawService {
            private array $mockRandomResult;

            public function __construct(
                DrawModel $drawModel,
                SwarmModel $swarmModel,
                CombModel $combModel,
                PlatformSettingModel $settingModel,
                array $mockRandomResult
            ) {
                parent::__construct($drawModel, $swarmModel, $combModel, $settingModel);
                $this->mockRandomResult = $mockRandomResult;
            }

            protected function callRandomOrg(string $apiKey, int $min, int $max): array
            {
                return $this->mockRandomResult;
            }
        };
    }

    /**
     * @return array{MockObject&DrawModel, MockObject&SwarmModel, MockObject&CombModel, MockObject&PlatformSettingModel}
     */
    private function buildMocks(): array
    {
        return [
            $this->createMock(DrawModel::class),
            $this->createMock(SwarmModel::class),
            $this->createMock(CombModel::class),
            $this->createMock(PlatformSettingModel::class),
        ];
    }

    // -------------------------------------------------------------------------
    // triggerDraw — selects winner correctly
    // -------------------------------------------------------------------------

    public function testTriggerDrawSelectsWinner(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        // No existing draw
        $drawModel->method('findBySwarmId')->with(1)->willReturn(false);

        // Swarm is full
        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm());

        // API key configured
        $settingModel->method('getValue')->with('random_org_api_key')->willReturn('test-key');

        // Random.org returns comb number 77
        $randomOrgResult = [
            'winning_number' => 77,
            'request_id'     => 'req-abc',
            'serial_number'  => 'serial-123',
            'raw_response'   => ['result' => ['random' => ['data' => [77]]]],
        ];

        // Winner comb found
        $combModel->method('getWinnerComb')->with(1, 77)->willReturn($this->fakeComb());

        // Draw insert returns id 1
        $drawModel->method('insert')->willReturn(1);

        // findById returns the created draw
        $drawModel->method('findById')->with(1)->willReturn($this->fakeDraw());

        // Status transition
        $swarmModel->expects($this->once())
            ->method('transitionStatus')
            ->with(1, 'draw_complete');

        $service = $this->buildServiceWithMockedRandomOrg(
            $drawModel, $swarmModel, $combModel, $settingModel, $randomOrgResult
        );

        $result = $service->triggerDraw(1);

        $this->assertSame(1, $result['swarm_id']);
        $this->assertSame(42, $result['winner_user_id']);
        $this->assertSame(77, $result['winning_number']);
        $this->assertNotNull($result['random_org_request_id']);
        $this->assertNotNull($result['random_org_verify_url']);
        $this->assertNotNull($result['random_org_raw_response']);
    }

    // -------------------------------------------------------------------------
    // triggerDraw — fails if swarm is not full
    // -------------------------------------------------------------------------

    public function testTriggerDrawFailsIfSwarmNotFull(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        // No existing draw
        $drawModel->method('findBySwarmId')->with(1)->willReturn(false);

        // Swarm is still active, not full
        $swarmModel->method('findById')->with(1)->willReturn(
            $this->fakeSwarm(['status' => 'active', 'combs_sold' => 50])
        );

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);

        $this->expectException(ValidationException::class);

        try {
            $service->triggerDraw(1);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('swarm', $e->getErrors());
            throw $e;
        }
    }

    // -------------------------------------------------------------------------
    // triggerDraw — idempotent (returns existing draw)
    // -------------------------------------------------------------------------

    public function testTriggerDrawIsIdempotent(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        $existingDraw = $this->fakeDraw();

        // Existing draw found
        $drawModel->method('findBySwarmId')->with(1)->willReturn($existingDraw);

        // insert should never be called
        $drawModel->expects($this->never())->method('insert');

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);

        $result = $service->triggerDraw(1);

        $this->assertSame($existingDraw['id'], $result['id']);
        $this->assertSame($existingDraw['winner_user_id'], $result['winner_user_id']);
    }

    // -------------------------------------------------------------------------
    // triggerDraw — fails when API key not configured
    // -------------------------------------------------------------------------

    public function testTriggerDrawFailsWhenApiKeyMissing(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        $drawModel->method('findBySwarmId')->with(1)->willReturn(false);
        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm());
        $settingModel->method('getValue')->with('random_org_api_key')->willReturn('');

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);

        $this->expectException(AppException::class);
        $this->expectExceptionMessage('Random.org API key is not configured.');

        $service->triggerDraw(1);
    }

    // -------------------------------------------------------------------------
    // getDrawResult — returns existing draw
    // -------------------------------------------------------------------------

    public function testGetDrawResultReturnsExistingDraw(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        $draw = $this->fakeDraw();
        $drawModel->method('findBySwarmId')->with(1)->willReturn($draw);

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);

        $result = $service->getDrawResult(1);
        $this->assertSame(1, $result['swarm_id']);
        $this->assertSame(42, $result['winner_user_id']);
    }

    // -------------------------------------------------------------------------
    // getDrawResult — throws NotFoundException when no draw exists
    // -------------------------------------------------------------------------

    public function testGetDrawResultThrowsNotFoundWhenNoDraw(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        $drawModel->method('findBySwarmId')->with(999)->willReturn(false);

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);

        $this->expectException(NotFoundException::class);

        $service->getDrawResult(999);
    }

    // -------------------------------------------------------------------------
    // buildRandomOrgVerifyUrl — correct format
    // -------------------------------------------------------------------------

    public function testBuildRandomOrgVerifyUrl(): void
    {
        $service = new DrawService(
            $this->createMock(DrawModel::class),
            $this->createMock(SwarmModel::class),
            $this->createMock(CombModel::class),
            $this->createMock(PlatformSettingModel::class),
        );

        $url = $service->buildRandomOrgVerifyUrl('12345');
        $this->assertSame('https://api.random.org/verify?serialNumber=12345', $url);
    }

    // -------------------------------------------------------------------------
    // markShipped — transitions draw_complete to shipped
    // -------------------------------------------------------------------------

    public function testMarkShippedSucceeds(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        $drawModel->method('findBySwarmId')->with(1)->willReturn($this->fakeDraw());
        $swarmModel->method('findById')->with(1)->willReturn(
            $this->fakeSwarm(['status' => 'draw_complete'])
        );
        $swarmModel->expects($this->once())
            ->method('transitionStatus')
            ->with(1, 'shipped');
        $swarmModel->method('update')->willReturn(true);

        $drawModel->method('findBySwarmIdWithDetails')->with(1)->willReturn(
            array_merge($this->fakeDraw(), ['swarm_title' => 'Test', 'swarm_status' => 'shipped'])
        );

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);
        $result = $service->markShipped(1);

        $this->assertSame(1, $result['swarm_id']);
    }

    // -------------------------------------------------------------------------
    // markShipped — fails when swarm not in draw_complete status
    // -------------------------------------------------------------------------

    public function testMarkShippedFailsWhenNotDrawComplete(): void
    {
        [$drawModel, $swarmModel, $combModel, $settingModel] = $this->buildMocks();

        $drawModel->method('findBySwarmId')->with(1)->willReturn($this->fakeDraw());
        $swarmModel->method('findById')->with(1)->willReturn(
            $this->fakeSwarm(['status' => 'full'])
        );

        $service = new DrawService($drawModel, $swarmModel, $combModel, $settingModel);

        $this->expectException(ValidationException::class);

        try {
            $service->markShipped(1);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->getErrors());
            throw $e;
        }
    }
}
