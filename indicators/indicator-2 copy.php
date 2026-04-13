<!-- Indicador 2 - Time de Especialistas (25%) 
-->
<div class="row">
    <div class="col-md-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>2 - Time de Especialistas (25%)</h3>
                <div id="chartIndicator2"></div>
            </div>
        </div>
    </div>
    <div class="col-md-6 mt-4">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">Média do S.T.I (Provas)</p>
                    </li>
                    <li>
                        <p class="text">Equilíbrio entre o time </p>
                    </li>
                    <li>
                        <p class="text">Desenvolvimento de Líderes</p>
                    </li>
                    <li>
                        <p class="text">Pesquisa de 360 (NPS)</p>
                    </li>
                </ul>
                <div class="row">
                    <?php foreach ($lojas as $loja) { ?>
                        <div class="col-md-6 mb-4">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content row">
                                    <h5 class="card-title"><?= $loja ?></h5>

                                    <?php if (!empty($avaliacoesTimeEspecialistasPorLoja[$loja])) { ?>
                                        <ul class="list d-flex flex-wrap justify-content-start align-items-start w-100">
                                            <li class="ms-3 mb-1 w-100">Taxa Equilíbrio Média: <?= $mediasTimeEspecialistas[$loja]['taxaRaw'] ?>%</li>
                                            <!--<li class="ms-3 mb-1 w-100">Taxa Equilíbrio Dif: <?= $mediasTimeEspecialistas[$loja]['difRaw'] ?>%</li>-->
                                            <li class="ms-3 mb-1 w-100">Desenvolvimento de Líderes Média: <?= $mediasTimeEspecialistas[$loja]['desenvRaw'] ?>%</li>
                                            <li class="ms-3 mb-1 w-100">Nota de Satisfação Média: <?= $mediasTimeEspecialistas[$loja]['satisfRaw'] ?>%</li>
                                            <li class="ms-3 mb-1 w-100">Nota STI Média: <?= $mediasTimeEspecialistas[$loja]['stiRaw'] ?>%</li>
                                            <li class="ms-3 mb-1 w-100"><strong>Nota Final Média:</strong> <?= $mediasTimeEspecialistas[$loja]['notaFinalRaw'] ?>%</li>
                                        </ul>

                                        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modalDetalhes-<?= $loja ?>">
                                            Ver Detalhes
                                        </button>
                                    <?php } else { ?>
                                        <p>Nenhuma avaliação registrada para esse período. <!--<?= $loja ?>.--></p>
                                    <?php } ?>
                                </div>
                            </div>
                        </div>

                        <!-- Modal Detalhes -->
                        <div class="modal fade" id="modalDetalhes-<?= $loja ?>" tabindex="-1" role="dialog">
                            <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable" role="document">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">Detalhes das Avaliações - <?= $loja ?></h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>
                                    <div class="modal-body">
                                        <div class="row">
                                            <?php if (!empty($avaliacoesTimeEspecialistasPorLoja[$loja])) { ?>
                                                <?php foreach ($avaliacoesTimeEspecialistasPorLoja[$loja] as $avaliacao) { ?>
                                                    <div class="col-auto">
                                                        <div class="card-details">
                                                            <div class="card-title">
                                                                <h5>Avaliador: <?= $dados['avaliador'] ?></h5>
                                                                <h6>Data Avaliação: <?= $dados['data'] ?></h6>
                                                            </div>
                                                            <div class="card-content">
                                                                <ul class="list-unstyled">
                                                                    <?php foreach ($avaliacoesTimeEspecialistasPorLoja[$loja] as $a): ?>
                                                                        <li>Dif. %: <?= $a['difPercentual'] ?>% <small class="text-muted">(nota <?= $a['taxaNota'] ?>%)</small></li>
                                                                        <li>Desenv: <?= $a['desenvBruto'] ?>/10 <small class="text-muted">(nota <?= $a['desenvNota'] ?>%)</small></li>
                                                                        <li>Pesquisa 360: <?= $a['satisfBruto'] ?>/10 <small class="text-muted">(nota <?= $a['satisfNota'] ?>%)</small></li>
                                                                        <li>STI: <?= $a['stiBruto'] ?>/10 <small class="text-muted">(nota <?= $a['stiNota'] ?>%)</small></li>
                                                                        <li><strong>Nota Final:</strong> <?= $a['notaFinal'] ?>% (de 25%)</li>
                                                                    <?php endforeach; ?>

                                                                </ul>
                                                            </div>
                                                        </div>
                                                    </div>
                                                <?php } ?>
                                            <?php } else { ?>
                                                <p>Nenhuma avaliação detalhada encontrada para esta loja.</p>
                                            <?php } ?>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    <?php } ?>
                </div>
            </div>
        </div>


    </div>
</div>