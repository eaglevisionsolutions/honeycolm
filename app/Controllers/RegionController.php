<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\RegionModel;

class RegionController extends BaseController
{
    private RegionModel $regionModel;

    public function __construct(?RegionModel $regionModel = null)
    {
        $this->regionModel = $regionModel ?? new RegionModel();
    }

    public function index(): never
    {
        try {
            $regions = $this->regionModel->findAllActive();
            $this->success(['regions' => $regions]);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
