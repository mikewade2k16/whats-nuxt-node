

<!-- indicator-1.php -->
<div id="indicator-1" class="row indicator">

    <!-- gráfico ---------------------------------------------------------->
    <div class="col-md-12 col-lg-6">
        <div class="card h-100">
            <div class="content">
                <h3>1 - Ambiente Aconchegante (<?= $pesoClasseOne ?>%)</h3>
                <div class="chart-indicator" id="chartIndicator1"></div>
            </div>
        </div>
    </div>

    <!-- cartões + modais ------------------------------------------------->
    <div class="col-md-12 col-lg-6">
        <div class="h-100">
            <div class="content">

                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">Reposição de café</p>
                    </li>
                    <li>
                        <p class="text">Bolo / Bebidas / Comidas</p>
                    </li>
                    <li>
                        <p class="text">Embalagens certas</p>
                    </li>
                    <li>
                        <p class="text">Mezanino Organizado</p>
                    </li>
                </ul>

                <div class="row">
                    <?php foreach ($dadosIndicador1Lojas as $loja => $info): ?>
                        <div class="col-md-6 mb-md-4 mb-3">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content">
                                    <h5><?= $loja ?></h5>

                                    <?php if (empty($info['avaliacoes'])): ?>
                                        <!-- SEM AVALIAÇÕES -->
                                        <p class="text-muted">Nenhuma avaliação registrada para esse período.</p>

                                    <?php else: ?>
                                        <!-- COM AVALIAÇÕES -->
                                        <p>Média: <strong><?= number_format($info['media'], 2) ?>%</strong></p>
                                        <!--<p>Média Final: <strong><?= number_format($info['media_final'], 2) ?>%</strong></p>-->

                                        

                                        <?php
                                        /* prepara dados faltantes + imagens */
                                        $itensFaltando = [];
                                        $avaliacoesComImg = [];

                                        foreach ($info['avaliacoes'] as $aval) {
                                            foreach ($aval['faltando'] as $f) {
                                                if (!in_array($f, $itensFaltando)) $itensFaltando[] = $f;
                                            }
                                            if (!empty($aval['imagens'])) $avaliacoesComImg[] = $aval;
                                        }
                                        ?>

                                        <?php if (empty($itensFaltando)): ?>
                                            <p>Todos os itens foram cumpridos</p>
                                        <?php else: ?>
                                            <p>Itens faltantes:</p>
                                            <ul class="list d-flex flex-wrap">
                                                <?php foreach ($itensFaltando as $item): ?>
                                                    <li class="me-3">- <?= $item ?></li>
                                                <?php endforeach; ?>
                                            </ul>
                                        <?php endif; ?>

                                        <?php if (!empty($avaliacoesComImg)): ?>
                                            <button class="btn btn-sm btn-primary"
                                                data-bs-toggle="modal"
                                                data-bs-target="#modalImgs-<?= $loja ?>">
                                                Ver Imagens
                                            </button>
                                        <?php endif; ?>

                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <!-- MODAL (só se houver imagens) -->
                        <?php if (!empty($avaliacoesComImg)):
                            ob_start(); ?>
                            <div class="modal fade" id="modalImgs-<?= $loja ?>" tabindex="-1" aria-hidden="true">
                                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h5 class="modal-title">Imagens – <?= $loja ?></h5>
                                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                        </div>

                                        <div class="modal-body">
                                            <div class="row">
                                                <?php foreach ($avaliacoesComImg as $aval): ?>
                                                    <div class="col-12 mb-4">
                                                        <div class="card-details p-2">
                                                            <!-- cabeçalho da avaliação -->
                                                            <div class="card-title mb-2">
                                                                <h6 class="mb-0">Avaliador: <?= $aval['avaliador'] ?></h6>
                                                                <small><?= $aval['data'] ?></small>
                                                            </div>

                                                            <!-- grid de imagens dessa avaliação -->
                                                            <div class="row">
                                                                <?php foreach ($aval['imagens'] as $img): ?>
                                                                    <div class="col-12 col-md-4 col-xl-3 mb-2">
                                                                        <p class="mb-1"><?= $img['item'] ?></p>
                                                                        <img src="../upload-indicadores/<?= $img['imagem'] ?>"
                                                                            class="img-fluid">
                                                                    </div>
                                                                <?php endforeach; ?>
                                                            </div>

                                                            <!-- nota única da avaliação -->
                                                            <p class="mt-2 mb-0">
                                                                <strong>Nota Bruta:</strong> <?= number_format($aval['nota'], 2) ?>%
                                                                &nbsp;|&nbsp;
                                                                <strong>Nota Final:</strong> <?= number_format($aval['notaFinal'], 2) ?>%
                                                            </p>
                                                            <hr>
                                                        </div>
                                                    </div>
                                                <?php endforeach; ?>

                                            </div>


                                            <p class="fw-bold">
                                                Nota Final do Indicador: <?= number_format($info['media'], 2) ?>%
                                                Para cálculo: <?= number_format($info['media_final'], 2) ?>%
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <?php $modaisIndicadores[1][] = ob_get_clean(); ?>
                        <?php endif; ?>

                    <?php endforeach; ?>
                </div> <!-- row cartões -->
            </div>
        </div>
    </div>
</div>
