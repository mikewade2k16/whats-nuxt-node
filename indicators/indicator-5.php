<?php
/*  $dadosIndicador5 já precisa existir antes de incluir este arquivo:
        $dadosIndicador5 = obterDadosIndicador5($startDate,$endDate,$conn);
*/
$pesoClasseFive = $dadosIndicador5['peso_classe'] ?? 0;
?>
<div id="indicator-5" class="row indicator">
    <!-- gráfico ---------------------------------------------------------->
    <div class="col-md-12 col-lg-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>5 ‑ Indicadores de Resultado (<?= number_format($pesoClasseFive, 0) ?>%)</h3>
                <div id="chartIndicador5"></div>

            </div>
        </div>
    </div>

    <!-- cartões + modais ------------------------------------------------->
    <div class="col-md-12 col-lg-6">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">Meta batida</p>
                    </li>
                    <li>
                        <p class="text">Ticket médio</p>
                    </li>
                    <li>
                        <p class="text">% desconto médio</p>
                    </li>
                </ul>

                <div class="row">
                    <?php foreach ($dadosIndicador5['lojas'] as $loja => $info): ?>
                        <div class="col-md-6 mt-4">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content">
                                    <h5><?= $loja ?></h5>

                                    <?php if (empty($info['avaliacoes'])): ?>
                                        <!-- SEM AVALIAÇÕES -->
                                        <p class="text-muted">Nenhuma avaliação registrada para esse período.</p>

                                    <?php else: ?>
                                        <!-- meta --------------------------------------------------->
                                        <p>
                                            Meta batida:
                                            <?= number_format($info['meta_real'], 2, ',', '.') ?>%
                                            (Meta: <?= number_format($info['meta_alvo'], 2, ',', '.') ?>%)
                                            <?= $info['meta_real'] >= $info['meta_alvo']
                                                ? '<small style="color:green;">✔</small>'
                                                : '<small style="color:red;">✖</small>' ?>
                                        </p>

                                        <!-- ticket ------------------------------------------------->
                                        <p>
                                            Ticket médio:
                                            R$<?= number_format($info['ticket_real'], 2, ',', '.') ?>
                                            (Meta: R$<?= number_format($info['ticket_alvo'], 2, ',', '.') ?>)
                                        </p>

                                        <!-- desconto ---------------------------------------------->
                                        <p>
                                            % desconto:
                                            <?= number_format($info['desc_real'], 2, ',', '.') ?>%
                                            (Máx.: <?= number_format($info['desc_alvo'], 2, ',', '.') ?>%)
                                        </p>

                                        <p class="title">
                                            Nota Final:
                                            <strong><?= number_format($info['nota_final_bruta_media'], 2, ',', '.') ?>%</strong>
                                        </p>

                                        <p class="title" style="display: none;">
                                            Nota Final do Indicador:
                                            <strong><?= number_format($info['media_final'], 2, ',', '.') ?>%</strong>
                                        </p>



                                        <!-- botão / modal --------------------------------------->
                                        <?php if (!empty($info['avaliacoes'])): ?>
                                            <button class="btn btn-primary mt-2"
                                                data-bs-toggle="modal"
                                                data-bs-target="#detIndicador5-<?= $loja ?>">
                                                Ver detalhes
                                            </button>

                                            <?php ob_start(); // inicia buffer 
                                            ?>
                                            <!-- modal ------------------------------------------->
                                            <div class="modal fade"
                                                id="detIndicador5-<?= $loja ?>"
                                                tabindex="-1" aria-hidden="true">
                                                <div class="modal-dialog modal-dialog-centered
                                                            modal-xl modal-dialog-scrollable">
                                                    <div class="modal-content">
                                                        <div class="modal-header">
                                                            <h5 class="modal-title">
                                                                Detalhes – <?= $loja ?>
                                                            </h5>
                                                            <button type="button" class="btn-close"
                                                                data-bs-dismiss="modal"></button>
                                                        </div>
                                                        <div class="modal-body">
                                                            <div class="row">
                                                                <?php foreach ($info['avaliacoes'] as $aval): ?>
                                                                    <!-- dentro do foreach de $info['avaliacoes'] as $aval -->
                                                                    <div class="col-12 mb-3">
                                                                        <div class="card-details">
                                                                            <div class="card-title">
                                                                                <h5>Avaliador: <?= $aval['avaliador'] ?></h5>
                                                                                <h6>Data: <?= $aval['data'] ?></h6>
                                                                            </div>
                                                                            <div class="card-content">
                                                                                <div class="row">
                                                                                    <!-- coluna valores reais / metas -->
                                                                                    <div class="col-md-4">
                                                                                        <p><strong>Meta batida:</strong>
                                                                                            <?= number_format($aval['meta_real'], 2, ',', '.') ?>%
                                                                                            (Meta: <?= number_format($aval['meta_alvo'], 2, ',', '.') ?>%)
                                                                                        </p>
                                                                                        <p><strong>Ticket médio:</strong>
                                                                                            R$<?= number_format($aval['ticket_real'], 2, ',', '.') ?>
                                                                                            (Meta: R$<?= number_format($aval['ticket_alvo'], 2, ',', '.') ?>)
                                                                                        </p>
                                                                                        <p><strong>% desconto:</strong>
                                                                                            <?= number_format($aval['desc_real'], 2, ',', '.') ?>%
                                                                                            (Máx.: <?= number_format($aval['desc_alvo'], 2, ',', '.') ?>%)
                                                                                        </p>
                                                                                    </div>

                                                                                    <!-- coluna desempenhos -->
                                                                                    <div class="col-md-4">
                                                                                        <p><strong>Desemp. Meta:</strong> <?= number_format($aval['desempenho_meta'],   2, ',', '.') ?>%</p>
                                                                                        <p><strong>Desemp. Ticket:</strong> <?= number_format($aval['desempenho_ticket'], 2, ',', '.') ?>%</p>
                                                                                        <p><strong>Desemp. Desconto:</strong> <?= number_format($aval['desempenho_desc'],   2, ',', '.') ?>%</p>
                                                                                    </div>

                                                                                    <!-- coluna notas ponderadas -->
                                                                                    <div class="col-md-4">
                                                                                        <p><strong>Nota item Meta:</strong> <?= number_format($aval['nota_meta'],   2, ',', '.') ?>%</p>
                                                                                        <p><strong>Nota item Ticket:</strong> <?= number_format($aval['nota_ticket'], 2, ',', '.') ?>%</p>
                                                                                        <p><strong>Nota item Desc.:</strong> <?= number_format($aval['nota_desc'],   2, ',', '.') ?>%</p>
                                                                                    </div>

                                                                                    <!-- linha final -->
                                                                                    <div class="col-12 d-flex border-top pt-2">
                                                                                        <h6 class="me-3"><strong>Nota Bruta:</strong>
                                                                                            <?= number_format($aval['nota_bruta'], 2, ',', '.') ?>%
                                                                                        </h6>
                                                                                        <h6><strong>Nota Final:</strong>
                                                                                            <?= number_format($aval['nota_final'], 2, ',', '.') ?>%
                                                                                        </h6>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                <?php endforeach; ?>

                                                                <p class="fw-bold">
                                                                    Nota Final do Indicador: <?= number_format($info['nota_final_bruta_media'], 2, ',', '.') ?>%
                                                                    Para cálculo: <?= number_format($info['media_final'], 2, ',', '.') ?>%
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <?php
                                            //modal exibido no template
                                            $modaisIndicadores[5][] = ob_get_clean(); // salva em array

                                            ?>
                                        <?php endif; ?>
                                    <?php endif; ?>

                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>


                </div> <!-- row cartões -->
            </div>
        </div>
    </div>
</div>