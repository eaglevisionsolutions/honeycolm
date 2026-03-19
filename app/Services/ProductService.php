<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ProductModel;
use App\Models\ProductImageModel;
use App\Exceptions\ValidationException;
use App\Exceptions\NotFoundException;

class ProductService
{
    private const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    private const MAX_FILE_SIZE      = 5 * 1024 * 1024; // 5 MB

    public function __construct(
        private ProductModel      $productModel      = new ProductModel(),
        private ProductImageModel $productImageModel = new ProductImageModel()
    ) {}

    /**
     * Creates a new product and optionally uploads images passed as $_FILES entries.
     * $files is an array of individual file arrays (each matching the $_FILES['field'] structure).
     */
    public function create(array $data, array $files = []): array
    {
        $this->validateProductData($data);

        $productId = $this->productModel->insert([
            'name'         => trim($data['name']),
            'brand'        => trim($data['brand']),
            'category'     => $data['category'],
            'retail_value' => (float) $data['retail_value'],
            'description'  => isset($data['description']) ? trim($data['description']) : null,
            'is_active'    => 1,
            'times_used'   => 0,
            'created_by'   => $data['created_by'] ?? null,
        ]);

        foreach ($files as $file) {
            $this->uploadImage($productId, $file);
        }

        return $this->productModel->findWithImages($productId);
    }

    /**
     * Updates an existing product's fields (no image upload in this method).
     */
    public function update(int $id, array $data): array
    {
        // Ensure the product exists
        $this->productModel->findById($id);

        $updateData = [];

        if (isset($data['name'])) {
            if (trim($data['name']) === '') {
                throw new ValidationException(['name' => 'Name is required.']);
            }
            $updateData['name'] = trim($data['name']);
        }

        if (isset($data['brand'])) {
            if (trim($data['brand']) === '') {
                throw new ValidationException(['brand' => 'Brand is required.']);
            }
            $updateData['brand'] = trim($data['brand']);
        }

        if (isset($data['category'])) {
            $this->validateCategory($data['category']);
            $updateData['category'] = $data['category'];
        }

        if (isset($data['retail_value'])) {
            if (!is_numeric($data['retail_value']) || (float) $data['retail_value'] <= 0) {
                throw new ValidationException(['retail_value' => 'Retail value must be a positive number.']);
            }
            $updateData['retail_value'] = (float) $data['retail_value'];
        }

        if (array_key_exists('description', $data)) {
            $updateData['description'] = $data['description'] !== null ? trim($data['description']) : null;
        }

        if (isset($data['is_active'])) {
            $updateData['is_active'] = (int) (bool) $data['is_active'];
        }

        if (!empty($updateData)) {
            $this->productModel->update($id, $updateData);
        }

        return $this->productModel->findWithImages($id);
    }

    /**
     * Returns a paginated list of products.
     */
    public function findAll(int $page, int $perPage, string $search, string $category): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));

        return $this->productModel->findAllPaginated($page, $perPage, $search, $category);
    }

    /**
     * Returns a single product with its images.
     */
    public function findById(int $id): array
    {
        return $this->productModel->findWithImages($id);
    }

    /**
     * Validates and moves an uploaded image file, inserts a product_images row,
     * and returns the new image row.
     *
     * @param array $file  A single $_FILES entry: ['name','type','tmp_name','error','size']
     */
    public function uploadImage(int $productId, array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new ValidationException(['image' => 'File upload failed (error code ' . ($file['error'] ?? -1) . ').']);
        }

        if (($file['size'] ?? 0) > self::MAX_FILE_SIZE) {
            throw new ValidationException(['image' => 'File exceeds the maximum allowed size of 5 MB.']);
        }

        $tmpPath  = $file['tmp_name'] ?? '';
        $mimeType = $this->detectMimeType($tmpPath);

        if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new ValidationException(['image' => 'File type not allowed. Only JPEG, PNG, and WebP images are accepted.']);
        }

        $ext      = $this->extensionForMime($mimeType);
        $filename = $productId . '_' . uniqid('', true) . '.' . $ext;
        $destDir  = dirname(__DIR__, 2) . '/public/uploads/products/';
        $destPath = $destDir . $filename;

        if (!is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }

        if (!$this->moveUploadedFile($tmpPath, $destPath)) {
            throw new ValidationException(['image' => 'Failed to save uploaded file.']);
        }

        $sortOrder = count($this->productImageModel->findByProductId($productId));

        $imageId = $this->productImageModel->insert([
            'product_id' => $productId,
            'file_path'  => 'uploads/products/' . $filename,
            'sort_order' => $sortOrder,
        ]);

        return $this->productImageModel->findById($imageId);
    }

    /**
     * Deletes a product image file and its DB row.
     */
    public function deleteImage(int $imageId): bool
    {
        return $this->productImageModel->deleteWithFile($imageId);
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    private function validateProductData(array $data): void
    {
        $errors = [];

        if (empty(trim((string) ($data['name'] ?? '')))) {
            $errors['name'] = 'Name is required.';
        }

        if (empty(trim((string) ($data['brand'] ?? '')))) {
            $errors['brand'] = 'Brand is required.';
        }

        if (empty($data['category'])) {
            $errors['category'] = 'Category is required.';
        } else {
            try {
                $this->validateCategory($data['category']);
            } catch (ValidationException $e) {
                $errors['category'] = $e->getErrors()['category'];
            }
        }

        if (!isset($data['retail_value']) || !is_numeric($data['retail_value']) || (float) $data['retail_value'] <= 0) {
            $errors['retail_value'] = 'Retail value must be a positive number.';
        }

        if ($errors) {
            throw new ValidationException($errors);
        }
    }

    private function validateCategory(string $category): void
    {
        $allowed = ['Electronics', 'Fashion', 'Gaming', 'Experiences', 'Collectibles'];
        if (!in_array($category, $allowed, true)) {
            throw new ValidationException(['category' => 'Category must be one of: ' . implode(', ', $allowed) . '.']);
        }
    }

    /**
     * Detects MIME type using finfo on the actual file — never trusts browser-supplied type.
     */
    private function detectMimeType(string $tmpPath): string
    {
        if ($tmpPath === '' || !file_exists($tmpPath)) {
            return '';
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $tmpPath);
        finfo_close($finfo);

        return $mime !== false ? $mime : '';
    }

    private function extensionForMime(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            default      => 'bin',
        };
    }

    /**
     * Wraps move_uploaded_file so tests can override it via a sub-class or mock.
     */
    protected function moveUploadedFile(string $from, string $to): bool
    {
        return move_uploaded_file($from, $to);
    }
}
