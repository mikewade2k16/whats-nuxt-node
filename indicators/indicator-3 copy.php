<!-- Indicador 3 -->
<div class="row">
    <div class="col-md-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>3 - Qualidade de Produtos e Serviços (<?= $pesoClasseThree ?>%)</h3>
                <!-- Gráfico do Indicador 3 (média final de cada loja) -->
                <div id="chartIndicador3"></div>
            </div>
        </div>
    </div>

    <div class="col-md-6">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">NPS ligado a serviço</p>
                    </li>
                </ul>

                <?php
                // Para definir uma meta de NPS
                $metaNps = 4; // Exemplo: se NPS for de 1 a 5, meta=4
                ?>
                <div class="row">
                    <?php
                    foreach ($lojas as $loja):
                        // Valores já calculados corretamente no backend:
                        $mediaNpsAbsoluta = $mediaNpsQualidade[$loja] ?? 0; // Média real (escala 0-5)
                        $mediaFinalPonderada = $notasFinaisQualidade[$loja] ?? 0; // Nota final com peso (0-10%)

                        // Porcentagem média real (em relação ao máximo 5)
                        $porcentagemMediaReal = ($mediaNpsAbsoluta / 5) * 100;

                        // Verifica se bateu a meta
                        $bateuMeta = ($mediaNpsAbsoluta >= $metaNps);
                        $styleMeta = $bateuMeta ? 'color:green;' : 'color:red;';
                    ?>
                        <div class="col-md-6">
                            <div class="card card-stores mb-3 <?= $loja ?>">
                                <div class="content p-3">
                                    <h5 class="fw-bold"><?= $loja ?></h5>

                                    <!-- Média real absoluta -->
                                    <p class="mb-1">
                                        Média do NPS:
                                        <strong style="<?= $styleMeta ?>">
                                            <?= number_format($mediaNpsAbsoluta, 2) ?>
                                        </strong>
                                        <?php if ($bateuMeta): ?>
                                            <small>(Bateu a meta)</small>
                                        <?php else: ?>
                                            <small>(Não bateu a meta)</small>
                                        <?php endif; ?>
                                    </p>

                                    <!-- Porcentagem média real -->
                                    <p class="mb-1">
                                        Porcentagem média:
                                        <strong><?= number_format($porcentagemMediaReal, 2) ?>%</strong>
                                    </p>

                                    <!-- Nota Final calculada com peso (para indicador gráfico) -->
                                    <p class="mb-2">
                                        Nota Final (com peso):
                                        <strong><?= number_format($mediaFinalPonderada, 2) ?>%</strong>
                                    </p>

                                    <!-- Botão detalhes modal -->
                                    <button type="button" class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#modalDetalhesNps-<?= $loja ?>">
                                        Ver detalhes
                                    </button>
                                </div>
                            </div>
                        </div>

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
                                        <div class="row">
                                            <?php
                                            if (!empty($avaliacoesQualidadePorLoja[$loja])) {
                                                foreach ($avaliacoesQualidadePorLoja[$loja] as $avalId => $avalInfo) {
                                                    $avaliador = $avalInfo['avaliador'];
                                                    $dtAtual = $avalInfo['dataAtualizacao'];
                                                    $npsServico = $avalInfo['npsServico'];
                                                    $notaFinal = $avalInfo['notaFinal'];
                                                    $porcentagemIndividual = $avalInfo['porcentagem'];

                                                    // Se bateu meta (4)
                                                    $bateu = ($npsServico >= $metaNps);
                                                    $colorMeta = $bateu ? 'green' : 'red';
                                            ?>
                                                    <div class="col-auto">
                                                        <div class="card-details">
                                                            <div class="card-title">
                                                                <h5>Avaliador: <?= $dados['avaliador'] ?></h5>
                                                                <h6>Data Avaliação: <?= $dados['data'] ?></h6>
                                                            </div>
                                                            <div class="card-content">
                                                                <strong>NPS Serviço (nota absoluta):</strong>
                                                                <span style="color:<?= $colorMeta ?>">
                                                                    <?= number_format($npsServico, 2) ?>
                                                                    <?php if ($bateu): ?>
                                                                        <small>(Meta OK)</small>
                                                                    <?php else: ?>
                                                                        <small>(Abaixo da meta)</small>
                                                                    <?php endif; ?>
                                                                </span><br>
                                                                <strong>Porcentagem individual:</strong> <?= number_format($porcentagemIndividual, 2) ?>%<br>
                                                                <strong>Nota Final (com peso):</strong> <?= number_format($notaFinal, 2) ?>%
                                                            </div>
                                                        </div>
                                                    </div>
                                            <?php
                                                }
                                            } else {
                                                echo "<p>Nenhuma avaliação encontrada para {$loja}.</p>";
                                            }
                                            ?>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    <?php endforeach; ?>
                </div>


            </div><!-- content -->
        </div><!-- h-100 -->
    </div><!-- col-md-6 -->
</div><!-- row -->