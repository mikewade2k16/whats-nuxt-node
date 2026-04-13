

<?php
// indicator-2.php

// $dadosIndicador2 foi definido antes de incluir este arquivo:
//   $dadosIndicador2 = obterDadosIndicador2($startDate,$endDate,$conn);
$pesoClasseTwo = $dadosIndicador2['peso_classe'] ?? 25;
$lojas         = array_keys($dadosIndicador2['lojas']);
?>

<div id="indicator-2" class="row indicator">
    <div class="col-md-12 col-lg-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>2 - Time de Especialistas (<?= $pesoClasseTwo ?>%)</h3>
                <div id="chartIndicator2"></div>
            </div>
        </div>
    </div>

    <div class="col-md-12 col-lg-6 mt-4">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">Média do S.T.I (Provas)</p>
                    </li>
                    <li>
                        <p class="text">Equilíbrio entre o time</p>
                    </li>
                    <li>
                        <p class="text">Desenvolvimento de Líderes</p>
                    </li>
                    <li>
                        <p class="text">Pesquisa de 360 (NPS)</p>
                    </li>
                </ul>

                <div class="row">
                    <?php foreach ($dadosIndicador2['lojas'] as $loja => $info): ?>
                        <div class="col-md-6 mb-4">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content">
                                    <h5><?= $loja ?></h5>

                                    <?php if (!empty($info['avaliacoes'])): ?>
                                        <ul class="list d-flex flex-column gap-1">
                                            <li><strong>STI Média:</strong> <?= $info['stiRaw'] ?>%</li>
                                            <li><strong>Equilíbrio do Time:</strong> <?= $info['taxaRaw'] ?>%</li>
                                            <li><strong>Desenv. Líderes:</strong> <?= $info['desenvRaw'] ?>%</li>
                                            <li><strong>Satisfação 360:</strong> <?= $info['satisfRaw'] ?>%</li>
                                            <li><strong>Nota Final Média:</strong> <?= $info['nota_final_bruta_media'] ?>%</li>

                                        </ul>

                                        <button type="button"
                                            class="btn btn-primary mt-2"
                                            data-bs-toggle="modal"
                                            data-bs-target="#modalDetalhes-<?= $loja ?>">
                                            Ver detalhes
                                        </button>
                                    <?php else: ?>
                                        <p class="text-muted">Nenhuma avaliação registrada para esse período.</p>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <!-- Modal de detalhes -->
                        <?php if (!empty($info['avaliacoes'])):
                            ob_start(); // inicia buffer
                        ?>

                            <div class="modal fade"
                                id="modalDetalhes-<?= $loja ?>"
                                tabindex="-1"
                                aria-hidden="true">
                                <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h5 class="modal-title">Detalhes – <?= $loja ?></h5>
                                            <button type="button" class="btn-close"
                                                data-bs-dismiss="modal"></button>
                                        </div>
                                        <div class="modal-body">
                                            <div class="row">
                                                <?php foreach ($info['avaliacoes'] as $aval): ?>
                                                    <div class="col-12 mb-3">
                                                        <div class="card-details">
                                                            <div class="card-title">
                                                                <h5>Avaliador: <?= $aval['avaliador'] ?></h5>
                                                                <h6>Data: <?= $aval['data'] ?></h6>
                                                            </div>
                                                            <div class="card-content">
                                                                <ul class="list-unstyled">
                                                                    <li><strong>STI:</strong> <?= $aval['stiRaw'] ?>/10 (Nota: <?= $aval['stiNota'] ?>%)</li>
                                                                    <li><strong>Equilíbrio do Time:</strong> <?= $aval['difPercentual'] ?>% (Nota: <?= $aval['taxaNota'] ?>%)</li>
                                                                    <li><strong>Desenv. Líderes:</strong> <?= $aval['desenvRaw'] ?>/10 (Nota: <?= $aval['desenvNota'] ?>%)</li>
                                                                    <li><strong>Satisfação 360:</strong> <?= $aval['satisfRaw'] ?>/10 (Nota: <?= $aval['satisfNota'] ?>%)</li>


                                                                </ul>
                                                                <!-- notas finais -->
                                                                <hr>
                                                                <p class="mb-0">
                                                                    <strong>Nota Bruta:</strong> <?= number_format($aval['notaBruta'], 2) ?>%
                                                                    &nbsp;|&nbsp;
                                                                    <strong>Nota Final:</strong> <?= number_format($aval['notaPonderada'], 2) ?>%
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                <?php endforeach; ?>
                                                <p class="fw-bold">
                                                    Nota Final do Indicador: <?= number_format($info['nota_final_bruta_media'], 2) ?>%
                                                    Para cálculo: <?= number_format($info['media_final'], 2) ?>%
                                                </p>
                                              
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <?php
                            //modal exibido no template
                            $modaisIndicadores[2][] = ob_get_clean(); // salva em array

                            ?>
                        <?php endif; ?>

                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>