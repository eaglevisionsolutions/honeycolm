<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\ProductService;

class ProductController extends BaseController
{
    public function __construct(
        private ProductService $productService = new ProductService()
    ) {}

    public function index(): never
    {
        try {
            $result = $this->productService->findAll(
                page:     (int) $this->param('page', 1),
                perPage:  (int) $this->param('per_page', 20),
                search:   (string) $this->param('search', ''),
                category: (string) $this->param('category', '')
            );
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function show(string $id): never
    {
        try {
            $result = $this->productService->findById((int) $id);
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function store(): never
    {
        try {
            $data  = $this->body();
            $files = $this->extractFiles($_FILES);
            $result = $this->productService->create($data, $files);
            $this->created($result, 'Product created.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function update(string $id): never
    {
        try {
            $result = $this->productService->update((int) $id, $this->body());
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function addImage(string $id): never
    {
        try {
            $file   = $_FILES['image'] ?? null;
            if ($file === null) {
                $this->error('No image file provided.', 422);
            }
            $result = $this->productService->uploadImage((int) $id, $file);
            $this->created($result, 'Image uploaded.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function deleteImage(string $id, string $imageId): never
    {
        try {
            $this->productService->deleteImage((int) $imageId);
            $this->success([], 'Image deleted.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * Normalises $_FILES into a flat array of individual file arrays,
     * handling both single files and multi-file inputs.
     */
    private function extractFiles(array $files): array
    {
        $result = [];
        foreach ($files as $file) {
            if (is_array($file['name'])) {
                // Multiple files under one input name
                $count = count($file['name']);
                for ($i = 0; $i < $count; $i++) {
                    $result[] = [
                        'name'     => $file['name'][$i],
                        'type'     => $file['type'][$i],
                        'tmp_name' => $file['tmp_name'][$i],
                        'error'    => $file['error'][$i],
                        'size'     => $file['size'][$i],
                    ];
                }
            } else {
                $result[] = $file;
            }
        }
        return $result;
    }
}
