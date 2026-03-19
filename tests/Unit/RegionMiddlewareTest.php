<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Middleware\RegionMiddleware;
use PDO;
use PDOStatement;

class RegionMiddlewareTest extends TestCase
{
    protected function setUp(): void
    {
        // Reset static state before each test
        RegionMiddleware::$region = null;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Build a RegionMiddleware with a mocked PDO that returns a given value
     * for the us_market_active platform_settings query.
     *
     * @return RegionMiddleware
     */
    private function buildMiddlewareWithUsActive(string $activeValue): RegionMiddleware
    {
        /** @var MockObject&PDOStatement $stmt */
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute')->willReturn(true);
        $stmt->method('fetchColumn')->willReturn($activeValue);

        /** @var MockObject&PDO $pdo */
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $middleware           = new RegionMiddleware($pdo);
        $middleware->testMode = true;

        return $middleware;
    }

    // -------------------------------------------------------------------------
    // Tests — region extraction from URL path
    // -------------------------------------------------------------------------

    /**
     * Validation Criteria #2 / #8: path /ca/swarms sets region to 'ca'.
     */
    public function testExtractsRegionFromPath(): void
    {
        $_SERVER['REQUEST_URI'] = '/ca/swarms';

        /** @var MockObject&PDO $pdo */
        $pdo = $this->createMock(PDO::class);
        // No DB call expected for /ca/ path
        $pdo->expects($this->never())->method('prepare');

        $middleware           = new RegionMiddleware($pdo);
        $middleware->testMode = true;
        $middleware->handle();

        $this->assertSame('ca', RegionMiddleware::$region);
    }

    /**
     * Validation Criteria #4: /ca/swarms when CA is active passes through.
     */
    public function testAllowsActiveRegion(): void
    {
        $_SERVER['REQUEST_URI'] = '/ca/swarms';

        /** @var MockObject&PDO $pdo */
        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->never())->method('prepare');

        $middleware           = new RegionMiddleware($pdo);
        $middleware->testMode = true;
        $middleware->handle();

        $this->assertSame('ca', RegionMiddleware::$region);
        $this->assertNull($middleware->redirectedTo, 'No redirect should occur for an active region');
    }

    /**
     * Validation Criteria #3: /us/swarms when us_market_active=0 redirects to /ca/.
     */
    public function testRejectsInactiveRegion(): void
    {
        $_SERVER['REQUEST_URI'] = '/us/swarms';

        $middleware = $this->buildMiddlewareWithUsActive('0');
        $middleware->handle();

        $this->assertSame('/ca/', $middleware->redirectedTo, 'Should redirect to /ca/ when US is inactive');
        // Region must NOT be set to 'us' — the redirect aborts region assignment
        $this->assertNotSame('us', RegionMiddleware::$region);
    }

    /**
     * Validation Criteria #8: /us/ path when US is active sets region to 'us'.
     */
    public function testSetsUsRegionWhenUsMarketIsActive(): void
    {
        $_SERVER['REQUEST_URI'] = '/us/swarms';

        $middleware = $this->buildMiddlewareWithUsActive('1');
        $middleware->handle();

        $this->assertSame('us', RegionMiddleware::$region);
        $this->assertNull($middleware->redirectedTo, 'No redirect should occur when US is active');
    }

    /**
     * No region prefix defaults to 'ca'.
     */
    public function testDefaultsToCanadaWhenNoPrefixPresent(): void
    {
        $_SERVER['REQUEST_URI'] = '/swarms';

        /** @var MockObject&PDO $pdo */
        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->never())->method('prepare');

        $middleware           = new RegionMiddleware($pdo);
        $middleware->testMode = true;
        $middleware->handle();

        $this->assertSame('ca', RegionMiddleware::$region);
    }

    /**
     * Bare /ca path (no trailing slash) still sets region to 'ca'.
     */
    public function testBareRegionPathWithoutTrailingSlash(): void
    {
        $_SERVER['REQUEST_URI'] = '/ca';

        /** @var MockObject&PDO $pdo */
        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->never())->method('prepare');

        $middleware           = new RegionMiddleware($pdo);
        $middleware->testMode = true;
        $middleware->handle();

        $this->assertSame('ca', RegionMiddleware::$region);
    }
}
