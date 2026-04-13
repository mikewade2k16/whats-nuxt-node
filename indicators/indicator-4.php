<!-- indicator-4.php -->
<div id="indicator-4" class="row indicator">
    <!-- gráfico -->
    <div class="col-md-12 col-lg-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>4 - Posicionamento e Branding (<?= $dadosIndicador4['peso_classe'] ?>%)</h3>
                <div id="chartIndicator4"></div>
            </div>
        </div>
    </div>

    <!-- cards + modais -->
    <div class="col-md-12 col-lg-6">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li><p class="text">Retorno do Pós Venda</p></li>
                    <li><p class="text">Vitrines e TVs no Padrão</p></li>
                    <li><p class="text">Mimos disponíveis</p></li>
                    <li><p class="text">Dress code</p></li>
                </ul>

                <div class="row">
                    <?php foreach ($dadosIndicador4['lojas'] as $loja => $info): ?>
                        <div class="col-md-6 mt-4">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content">
                                    <h5><?= $loja ?></h5>

                                    <?php if (empty($info['avaliacoes'])): ?>
                                        <!-- Sem avaliações -->
                                        <p class="text-muted">Nenhuma avaliação registrada para esse período.</p>
                                    <?php else: ?>
                                        <!-- Com avaliações -->
                                        <p>
                                            Retorno Pós‑venda: <?= number_format($info['retorno_raw'], 2, ',', '.') ?>%
                                            <?php if ($info['retorno_raw'] >= $info['meta_retorno']): ?>
                                                <small style="color:green;">Bateu a meta</small>
                                            <?php else: ?>
                                                <small style="color:red;">Não bateu a meta</small>
                                            <?php endif; ?>
                                        </p>

                                        <?php
                                        $faltando = [];
                                        foreach ($info['avaliacoes'] as $aval) {
                                            if (!$aval['vitrines_raw']) $faltando['Vitrines e TVs Padrão'] = $aval['imagem_vitrines'];
                                            if (!$aval['mimos_raw'])    $faltando['Mimos Disponíveis']    = $aval['imagem_mimos'];
                                            if (!$aval['dresscode_raw'])$faltando['Dress Code']           = $aval['imagem_dress'];
                                        }
                                        ?>

                                        <?php if (empty($faltando)): ?>
                                            <p>Todos os itens cumpridos</p>
                                        <?php else: ?>
                                            <p><small style="color:red;">Itens não cumpridos:</small></p>
                                            <ul class="list d-flex flex-column gap-2">
                                                <?php foreach (array_keys($faltando) as $item): ?>
                                                    <li><?= $item ?></li>
                                                <?php endforeach; ?>
                                            </ul>

                                            <button class="btn btn-primary btn-sm mt-2"
                                                data-bs-toggle="modal"
                                                data-bs-target="#modalIndicatorFour-<?= $loja ?>">
                                                Ver detalhes
                                            </button>
                                        <?php endif; ?>

                                        <p class="title mt-2">
                                            Média Final: <?= number_format($info['nota_final_bruta_media'], 2, ',', '.') ?>%
                                        </p>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <!-- Modal de detalhes -->
                        <?php if (!empty($info['avaliacoes'])):
                            ob_start(); ?>
                            <div class="modal fade" id="modalIndicatorFour-<?= $loja ?>" tabindex="-1" aria-hidden="true">
                                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h5 class="modal-title">Detalhes – <?= $loja ?></h5>
                                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                        </div>

                                        <div class="modal-body">
                                            <div class="row">
                                                <?php foreach ($info['avaliacoes'] as $aval): ?>
                                                    <div class="col-12 mb-4">
                                                        <div class="card-details p-2">
                                                            <div class="card-title mb-2">
                                                                <h6 class="mb-0">Avaliador: <?= $aval['avaliador'] ?></h6>
                                                                <small><?= $aval['data'] ?></small>
                                                            </div>

                                                            <div class="row">
                                                                <?php if (!$aval['vitrines_raw'] && $aval['imagem_vitrines']): ?>
                                                                    <div class="col-12 col-md-4 col-xl-3 mb-2">
                                                                        <p class="mb-1">Vitrines e TVs Padrão</p>
                                                                        <img src="../upload-indicadores/<?= $aval['imagem_vitrines'] ?>" class="img-fluid">
                                                                    </div>
                                                                <?php endif; ?>
                                                                <?php if (!$aval['mimos_raw'] && $aval['imagem_mimos']): ?>
                                                                    <div class="col-12 col-md-4 col-xl-3 mb-2">
                                                                        <p class="mb-1">Mimos Disponíveis</p>
                                                                        <img src="../upload-indicadores/<?= $aval['imagem_mimos'] ?>" class="img-fluid">
                                                                    </div>
                                                                <?php endif; ?>
                                                                <?php if (!$aval['dresscode_raw'] && $aval['imagem_dress']): ?>
                                                                    <div class="col-12 col-md-4 col-xl-3 mb-2">
                                                                        <p class="mb-1">Dress Code</p>
                                                                        <img src="../upload-indicadores/<?= $aval['imagem_dress'] ?>" class="img-fluid">
                                                                    </div>
                                                                <?php endif; ?>
                                                            </div>

                                                            <p class="mt-2 mb-0">
                                                                <strong>Nota Bruta:</strong> <?= number_format($aval['nota_final_bruta'], 2, ',', '.') ?>%
                                                                &nbsp;|&nbsp;
                                                                <strong>Nota Final:</strong> <?= number_format($aval['nota_final'], 2, ',', '.') ?>%
                                                            </p>
                                                            <hr>
                                                        </div>
                                                    </div>
                                                <?php endforeach; ?>
                                            </div>

                                            <p class="fw-bold">
                                                Nota Final do Indicador: <?= number_format($info['nota_final_bruta_media'], 2, ',', '.') ?>%
                                                Para cálculo: <?= number_format($info['media_final'], 2, ',', '.') ?>%
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        <?php
                            $modaisIndicadores[4][] = ob_get_clean();
                        endif; ?>

                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>
