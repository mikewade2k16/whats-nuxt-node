<!-- Indicador 3 -->
<div id="indicator-3" class="row indicator">
    <div class="col-md-12 col-lg-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>3 - Qualidade de Produtos e Serviços (<?= $dadosIndicador3['peso_classe'] ?>%)</h3>
                <!-- Gráfico do Indicador 3 (média final de cada loja) -->
                <div id="chartIndicador3"></div>
            </div>
        </div>
    </div>

    <div class="col-md-12 col-lg-6">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">NPS ligado a serviço</p>
                    </li>
                </ul>

                <div class="row">
                    <?php foreach ($dadosIndicador3['lojas'] as $loja => $info): ?>
                        <div class="col-md-6">
                            <div class="card card-stores mb-3 <?= $loja ?>">
                                <div class="content p-3">
                                    <h5 class="fw-bold"><?= $loja ?></h5>
                                    <?php if (empty($info['avaliacoes'])): ?>
                                        <!-- SEM AVALIAÇÕES -->
                                        <p class="text-muted">Nenhuma avaliação registrada para esse período.</p>

                                    <?php else: ?>

                                        <p class="mb-1">
                                            Média do NPS:
                                            <strong style="<?= ($info['npsBruto'] / 10 >= 0.8) ? 'color:green;' : 'color:red;' ?>">
                                                <?= number_format($info['npsBruto'] / 10 * 5, 2) ?>
                                            </strong>
                                            <small><?= ($info['npsBruto'] / 10 * 5 >= 4) ? '(Bateu a meta)' : '(Não bateu a meta)' ?></small>
                                        </p>

                                        <p class="mb-1">
                                            Porcentagem média:
                                            <strong><?= number_format($info['npsNota'], 2) ?>%</strong>
                                        </p>

                                        <!--<p class="mb-2">
                                        Nota Final (com peso):
                                        <strong><?= number_format($info['media_final'], 2) ?>%</strong>
                                    </p> -->

                                        <button type="button" class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#modalDetalhesNps-<?= $loja ?>">
                                            Ver detalhes
                                        </button>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <?php ob_start(); // inicia buffer 
                        ?>
                        <!-- MODAL de Detalhes individuais -->
                        <div class="modal fade" id="modalDetalhesNps-<?= $loja ?>" tabindex="-1" role="dialog" aria-hidden="true">
                            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">
                                            Detalhes das Avaliações NPS (<?= $loja ?>)
                                        </h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>

                                    <div class="modal-body">
                                        <?php foreach ($info['avaliacoes'] as $aval): ?>
                                            <div class="row mb-4">
                                                <div class="col-auto">
                                                    <div class="card-details">
                                                        <div class="card-title">
                                                            <h5>Avaliador: <?= $aval['avaliador'] ?></h5>
                                                            <h6>Data Avaliação: <?= $aval['data'] ?></h6>
                                                        </div>
                                                        <div class="card-content">
                                                            <strong>NPS Serviço (nota absoluta):</strong>
                                                            <span style="color:<?= ($aval['npsBruto'] / 10 * 5 >= 4) ? 'green' : 'red' ?>">
                                                                <?= number_format($aval['npsBruto'] / 10 * 5, 2) ?>
                                                                <small><?= ($aval['npsBruto'] / 10 * 5 >= 4) ? '(Meta OK)' : '(Abaixo da meta)' ?></small>
                                                            </span>
                                                            <hr>
                                                            <p class="">
                                                                <strong>Porcentagem individual:</strong> <?= number_format($aval['npsNota'], 2) ?>%<br>
                                                                <strong>Nota Final (com peso):</strong> <?= number_format($aval['notaFinal'], 2) ?>%
                                                            </p>

                                                        </div>
                                                    </div>



                                                </div>

                                            </div>

                                        <?php endforeach; ?>
                                        <p class="fw-bold">
                                            Nota Final do Indicador: <?= number_format($info['npsBruto'], 2) ?>%
                                            para cálculo: <?= number_format($info['media_final'], 2) ?>%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <?php
                        //modal exibido no template
                        $modaisIndicadores[2][] = ob_get_clean(); // salva em array

                        ?>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>