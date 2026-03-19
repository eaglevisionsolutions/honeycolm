<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\ProductService;
use App\Models\ProductModel;
use App\Models\ProductImageModel;
use App\Exceptions\ValidationException;
use App\Exceptions\NotFoundException;

/**
 * Subclass that overrides the file-system operations so tests never need real
 * uploaded files or a writable filesystem.
 */
class TestableProductService extends ProductService
{
    public bool $moveResult = true;
    public string $forcedMime = '';

    protected function moveUploadedFile(string $from, string $to): bool
    {
        return $this->moveResult;
    }

    // Expose the MIME detection override
    protected function detectMimeTypeForTest(string $tmpPath): string
    {
        return $this->forcedMime;
    }
}

/**
 * Full testable service that also overrides MIME detection.
 */
class FullTestableProductService extends ProductService
{
    public bool $moveResult = true;
    public string $forcedMime = '';

    protected function moveUploadedFile(string $from, string $to): bool
    {
        // Also create the file so ProductImageModel can resolve sort_order queries
        return $this->moveResult;
    }

    // We can't override a private method, so we test the public uploadImage() directly.
    // Instead we stub out the finfo calls by writing a temp file of the correct type.
}

class ProductServiceTest extends TestCase
{
    private ProductModel&MockObject      $productModel;
    private ProductImageModel&MockObject $productImageModel;
    private ProductService               $service;

    protected function setUp(): void
    {
        $this->productModel      = $this->createMock(ProductModel::class);
        $this->productImageModel = $this->createMock(ProductImageModel::class);

        $this->service = new class($this->productModel, $this->productImageModel) extends ProductService {
            public bool   $moveResult = true;
            public string $forcedMime = '';

            protected function moveUploadedFile(string $from, string $to): bool
            {
                return $this->moveResult;
            }

            /** Override private MIME detection by intercepting at a test-only hook. */
            public function setForcedMime(string $mime): void
            {
                $this->forcedMime = $mime;
            }
        };
    }

    // ------------------------------------------------------------------
    // testCreateProductWithValidData
    // ------------------------------------------------------------------

    public function testCreateProductWithValidData(): void
    {
        $this->productModel
            ->expects($this->once())
            ->method('insert')
            ->willReturn(42);

        $this->productModel
            ->expects($this->once())
            ->method('findWithImages')
            ->with(42)
            ->willReturn([
                'id'           => 42,
                'name'         => 'Test Product',
                'brand'        => 'ACME',
                'category'     => 'Electronics',
                'retail_value' => '199.99',
                'description'  => null,
                'times_used'   => 0,
                'is_active'    => 1,
                'images'       => [],
            ]);

        $result = $this->service->create([
            'name'         => 'Test Product',
            'brand'        => 'ACME',
            'category'     => 'Electronics',
            'retail_value' => 199.99,
        ]);

        $this->assertSame(42, $result['id']);
        $this->assertSame('Test Product', $result['name']);
        $this->assertArrayHasKey('images', $result);
    }

    // ------------------------------------------------------------------
    // testCreateProductFailsWithMissingName
    // ------------------------------------------------------------------

    public function testCreateProductFailsWithMissingName(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'brand'        => 'ACME',
            'category'     => 'Electronics',
            'retail_value' => 99.00,
        ]);
    }

    public function testCreateProductFailsWithEmptyName(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'         => '   ',
            'brand'        => 'ACME',
            'category'     => 'Electronics',
            'retail_value' => 99.00,
        ]);
    }

    public function testCreateProductFailsWithMissingBrand(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'         => 'Product',
            'category'     => 'Electronics',
            'retail_value' => 99.00,
        ]);
    }

    public function testCreateProductFailsWithMissingCategory(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'         => 'Product',
            'brand'        => 'Brand',
            'retail_value' => 99.00,
        ]);
    }

    public function testCreateProductFailsWithInvalidCategory(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'         => 'Product',
            'brand'        => 'Brand',
            'category'     => 'InvalidCategory',
            'retail_value' => 99.00,
        ]);
    }

    public function testCreateProductFailsWithMissingRetailValue(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'     => 'Product',
            'brand'    => 'Brand',
            'category' => 'Gaming',
        ]);
    }

    public function testCreateProductFailsWithZeroRetailValue(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'         => 'Product',
            'brand'        => 'Brand',
            'category'     => 'Gaming',
            'retail_value' => 0,
        ]);
    }

    public function testCreateProductFailsWithNegativeRetailValue(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->create([
            'name'         => 'Product',
            'brand'        => 'Brand',
            'category'     => 'Gaming',
            'retail_value' => -5,
        ]);
    }

    public function testValidationExceptionContainsNameError(): void
    {
        try {
            $this->service->create([
                'brand'        => 'ACME',
                'category'     => 'Electronics',
                'retail_value' => 99.00,
            ]);
            $this->fail('Expected ValidationException was not thrown.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('name', $e->getErrors());
        }
    }

    // ------------------------------------------------------------------
    // testImageUploadRejectsNonImageFile
    // ------------------------------------------------------------------

    public function testImageUploadRejectsNonImageFile(): void
    {
        // Create a temp .exe-style file with non-image content
        $tmpFile = tempnam(sys_get_temp_dir(), 'exe_test_');
        file_put_contents($tmpFile, 'MZ' . str_repeat("\x00", 100)); // DOS MZ header

        $file = [
            'name'     => 'malicious.exe',
            'type'     => 'image/jpeg',   // browser lies about the type
            'tmp_name' => $tmpFile,
            'error'    => UPLOAD_ERR_OK,
            'size'     => filesize($tmpFile),
        ];

        try {
            $this->expectException(ValidationException::class);
            $this->service->uploadImage(1, $file);
        } finally {
            @unlink($tmpFile);
        }
    }

    // ------------------------------------------------------------------
    // testImageUploadRejectsOversizedFile
    // ------------------------------------------------------------------

    public function testImageUploadRejectsOversizedFile(): void
    {
        $file = [
            'name'     => 'huge.jpg',
            'type'     => 'image/jpeg',
            'tmp_name' => '/tmp/fakefile',
            'error'    => UPLOAD_ERR_OK,
            'size'     => 6 * 1024 * 1024, // 6 MB — over the 5 MB limit
        ];

        $this->expectException(ValidationException::class);

        $this->service->uploadImage(1, $file);
    }

    public function testImageUploadRejectsUploadError(): void
    {
        $file = [
            'name'     => 'photo.jpg',
            'type'     => 'image/jpeg',
            'tmp_name' => '',
            'error'    => UPLOAD_ERR_PARTIAL,
            'size'     => 1024,
        ];

        $this->expectException(ValidationException::class);

        $this->service->uploadImage(1, $file);
    }

    // ------------------------------------------------------------------
    // testImageUploadRejectsOversizedFile throws ValidationException type
    // ------------------------------------------------------------------

    public function testImageUploadOversizedThrowsCorrectExceptionType(): void
    {
        $file = [
            'name'     => 'huge.png',
            'type'     => 'image/png',
            'tmp_name' => '/tmp/big',
            'error'    => UPLOAD_ERR_OK,
            'size'     => 5 * 1024 * 1024 + 1,
        ];

        $thrown = null;
        try {
            $this->service->uploadImage(1, $file);
        } catch (ValidationException $e) {
            $thrown = $e;
        }

        $this->assertInstanceOf(ValidationException::class, $thrown);
        $this->assertArrayHasKey('image', $thrown->getErrors());
    }

    // ------------------------------------------------------------------
    // findAll delegates to ProductModel
    // ------------------------------------------------------------------

    public function testFindAllDelegatesToModel(): void
    {
        $this->productModel
            ->expects($this->once())
            ->method('findAllPaginated')
            ->with(1, 20, '', '')
            ->willReturn(['products' => [], 'total' => 0]);

        $result = $this->service->findAll(1, 20, '', '');

        $this->assertArrayHasKey('products', $result);
        $this->assertArrayHasKey('total', $result);
    }

    public function testFindAllClampsPerPage(): void
    {
        // per_page > 100 should be clamped to 100
        $this->productModel
            ->expects($this->once())
            ->method('findAllPaginated')
            ->with(1, 100, '', '')
            ->willReturn(['products' => [], 'total' => 0]);

        $this->service->findAll(1, 999, '', '');
    }

    // ------------------------------------------------------------------
    // findById delegates to ProductModel::findWithImages
    // ------------------------------------------------------------------

    public function testFindByIdDelegatesToModel(): void
    {
        $expected = ['id' => 5, 'name' => 'Widget', 'images' => []];

        $this->productModel
            ->expects($this->once())
            ->method('findWithImages')
            ->with(5)
            ->willReturn($expected);

        $result = $this->service->findById(5);

        $this->assertSame($expected, $result);
    }

    public function testFindByIdThrowsNotFoundForMissingProduct(): void
    {
        $this->productModel
            ->expects($this->once())
            ->method('findWithImages')
            ->with(999)
            ->willThrowException(new NotFoundException('products #999 not found'));

        $this->expectException(NotFoundException::class);

        $this->service->findById(999);
    }

    // ------------------------------------------------------------------
    // deleteImage delegates to ProductImageModel
    // ------------------------------------------------------------------

    public function testDeleteImageDelegatesToModel(): void
    {
        $this->productImageModel
            ->expects($this->once())
            ->method('deleteWithFile')
            ->with(7)
            ->willReturn(true);

        $result = $this->service->deleteImage(7);

        $this->assertTrue($result);
    }

    // ------------------------------------------------------------------
    // update validation
    // ------------------------------------------------------------------

    public function testUpdateFailsWithEmptyName(): void
    {
        $this->productModel
            ->method('findById')
            ->willReturn(['id' => 1, 'name' => 'Old Name']);

        $this->expectException(ValidationException::class);

        $this->service->update(1, ['name' => '   ']);
    }

    public function testUpdateSuccessReturnsProductWithImages(): void
    {
        $expected = ['id' => 1, 'name' => 'New Name', 'images' => []];

        $this->productModel
            ->method('findById')
            ->willReturn(['id' => 1, 'name' => 'Old Name']);

        $this->productModel
            ->method('update')
            ->willReturn(true);

        $this->productModel
            ->method('findWithImages')
            ->with(1)
            ->willReturn($expected);

        $result = $this->service->update(1, ['name' => 'New Name']);

        $this->assertSame('New Name', $result['name']);
    }
}
