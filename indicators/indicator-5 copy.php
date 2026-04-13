<?php
global $pesoClasseFive;

// globais que vêm do back
foreach (['Riomar', 'Jardins', 'Garcia', 'Treze'] as $l) {
    global ${"metaBatida$l"}, ${"meta$l"},
        ${"ticketMedio$l"}, ${"ticketMedioMeta$l"},
        ${"percentualDesc$l"}, ${"percentualDescMeta$l"},
        ${"desempenhoMeta$l"}, ${"desempenhoTicket$l"}, ${"desempenhoDesc$l"},
        ${"notaMeta$l"}, ${"notaTicket$l"}, ${"notaDesc$l"},
        ${"notaBrutaIndicadorResultado$l"}, ${"notaFinalIndicadorResultado$l"};
}
$lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];


$avaliacoesIndicadorResultadoPorLoja = obterAvaliacoesIndicadorResultadoPorLoja($startDate, $endDate, $conn);

?>


<div class="row">
    <div class="col-md-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>5 ‑ Indicadores de Resultado (<?= formatarNumero($pesoClasseFive ?? 0) ?>%)</h3>
                <div id="chartIndicador5"></div>
            </div>
        </div>
    </div>

    <div class="col-md-6">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">Meta batida</p>
                    </li>
                    <li>
                        <p class="text">Ticket médio alvo</p>
                    </li>
                    <li>
                        <p class="text">Percentual de desconto médio</p>
                    </li>
                </ul>

                <div class="row">
                    <?php foreach ($lojas as $loja): ?>
                        <?php
                        $metaReal    = ${"metaBatida$loja"}     ?? null;
                        $metaAlvo    = ${"meta$loja"}           ?? null;
                        $ticketReal  = ${"ticketMedio$loja"}    ?? null;
                        $ticketAlvo  = ${"ticketMedioMeta$loja"} ?? null;
                        $descReal    = ${"percentualDesc$loja"} ?? null;
                        $descAlvo    = ${"percentualDescMeta$loja"} ?? null;

                        $notaMeta    = ${"notaMeta$loja"}        ?? null;
                        $notaTicket  = ${"notaTicket$loja"}      ?? null;
                        $notaDesc    = ${"notaDesc$loja"}        ?? null;
                        $notaBruta   = ${"notaBrutaIndicadorResultado$loja"} ?? null;
                        $notaFinal   = ${"notaFinalIndicadorResultado$loja"} ?? null;

                        $temDados = !is_null($metaReal) && !is_null($metaAlvo)
                            && !is_null($ticketReal) && !is_null($ticketAlvo)
                            && !is_null($descReal) && !is_null($descAlvo);
                        ?>

                        <div class="col-md-6 mt-4">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content">
                                    <h5><?= $loja ?></h5>

                                    <?php if ($temDados): ?>
                                        <!-- Meta batida --
                                        <p>
                                            Meta batida: <?= formatarNumero($metaReal) ?>%
                                            (Meta: <?= formatarNumero($metaAlvo) ?>%)
                                            <?= $metaReal >= $metaAlvo
                                                ? '<small style="color:green;">✔</small>'
                                                : '<small style="color:red;">✖</small>' ?>
                                        </p>

                                        <!-- Ticket médio --
                                        <p>
                                            Ticket médio: R$<?= number_format($ticketReal, 2, ',', '.') ?>
                                            (Meta: R$<?= number_format($ticketAlvo, 2, ',', '.') ?>)
                                        </p>

                                        <!-- Percentual de desconto --
                                        <p>
                                            % desconto: <?= number_format($descReal, 2, ',', '.') ?>%
                                            (Máx.: <?= number_format($descAlvo, 2, ',', '.') ?>%)
                                        </p>

                                        <hr>
                                        <!--<p>Nota item Meta: <strong><?= number_format($notaMeta, 2, ',', '.') ?>%</strong></p>-->

                                        <p>Desempenho Meta: <strong><?= number_format($desempenhoMetaRiomar, 2, ',', '.') ?>%</strong></p>
                                        <p>Ticket médio: <strong><?= number_format($notaTicket, 2, ',', '.') ?>%</strong></p>
                                        <p>Percentual de desconto: <strong><?= number_format($notaDesc, 2, ',', '.') ?>%</strong></p>

                                        <p class="title">Média Final: <strong><?= number_format($notaBruta, 2, ',', '.') ?>%</strong></p>
                                        <!--
                                        <p class="title">Média Final: <strong><?= number_format($notaFinal, 2, ',', '.') ?>%</strong></p>
                                        -->
                                        <!-- Botão para abrir o modal -->
                                        <button type="button" class="btn btn-primary mt-3" data-bs-toggle="modal" data-bs-target="#modalIndicador5-<?= $loja ?>">
                                            Ver Detalhes
                                        </button>




                                        <?php foreach ($lojas as $loja): ?>
                                            <?php if (!empty($avaliacoesIndicadorResultadoPorLoja[$loja])): ?>


                                                <!-- Modal único para todas as avaliações da loja -->
                                                <div class="modal fade" id="modalIndicador5-<?= $loja ?>" tabindex="-1" aria-labelledby="modalIndicador5Label<?= $loja ?>" aria-hidden="true">
                                                    <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                                                        <div class="modal-content">
                                                            <div class="modal-header">
                                                                <h5 class="modal-title">Detalhes das Avaliações - <?= $loja ?></h5>
                                                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                                                            </div>
                                                            <div class="modal-body">
                                                                <div class="row">
                                                                    <?php foreach ($avaliacoesIndicadorResultadoPorLoja[$loja] as $i => $avaliacao): ?>

                                                                        <div class="col-12">
                                                                            <div class="card-details">
                                                                                <div class="card-title">
                                                                                    <h5>Avaliador: <?= $dados['avaliador'] ?></h5>
                                                                                    <h6>Data Avaliação: <?= $dados['data'] ?></h6>
                                                                                </div>
                                                                                <div class="card-content">
                                                                                    <div class="row">
                                                                                        <div class="col-md-4">
                                                                                            <p><strong>Meta batida:</strong> <?= formatarNumero($avaliacao['meta_batida']) ?>% (Meta: <?= formatarNumero($avaliacao['meta']) ?>%)</p>
                                                                                            <p><strong>Ticket médio:</strong> R$<?= number_format($avaliacao['ticket_medio'], 2, ',', '.') ?> (Meta: R$<?= number_format($avaliacao['ticket_meta'], 2, ',', '.') ?>)</p>
                                                                                            <p><strong>% desconto:</strong> <?= number_format($avaliacao['desconto'], 2, ',', '.') ?>% (Máximo: <?= number_format($avaliacao['desconto_meta'], 2, ',', '.') ?>%)</p>
                                                                                        </div>
                                                                                        <div class="col-md-4">
                                                                                            <p><strong>Desempenho Meta:</strong> <?= number_format($avaliacao['desempenho_meta'], 2, ',', '.') ?>%</p>
                                                                                            <p><strong>Desempenho Ticket:</strong> <?= number_format($avaliacao['desempenho_ticket'], 2, ',', '.') ?>%</p>
                                                                                            <p><strong>Desempenho Desconto:</strong> <?= number_format($avaliacao['desempenho_desconto'], 2, ',', '.') ?>%</p>
                                                                                        </div>
                                                                                        <div class="col-md-4">
                                                                                            <p><strong>Nota item Meta:</strong> <?= number_format($avaliacao['nota_meta'], 2, ',', '.') ?>%</p>
                                                                                            <p><strong>Nota item Ticket:</strong> <?= number_format($avaliacao['nota_ticket'], 2, ',', '.') ?>%</p>
                                                                                            <p><strong>Nota item Desconto:</strong> <?= number_format($avaliacao['nota_desconto'], 2, ',', '.') ?>%</p>

                                                                                        </div>
                                                                                        <div class="col-12 d-flex border-top">
                                                                                            <h5 class="me-2 mt-4"><strong>Nota Bruta:</strong> <?= number_format($avaliacao['nota_bruta'], 2, ',', '.') ?>%</h5>
                                                                                            <h5 class="ms-2 mt-4"><strong>Nota Final:</strong> <?= number_format($avaliacao['nota_final'], 2, ',', '.') ?>%</h5>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <!--
                                                                    <?php if ($i + 1 < count($avaliacoesIndicadorResultadoPorLoja[$loja])): ?>
                                                                        <hr class="my-4">
                                                                    <?php endif; ?>
                                                                    -->
                                                                    <?php endforeach; ?>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            <?php endif; ?>
                                        <?php endforeach; ?>


                                    <?php else: ?>
                                        <p class="">Nenhuma avaliação registrada para esse período.</p>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>

                </div>
            </div>
        </div>
    </div>
</div>