<?php
include 'app/views/admin/pages/functions/base.php';
include 'app/views/admin/pages/functions/indicatorOne.php';
include 'app/views/admin/pages/functions/indicatorTwo.php';
include 'app/views/admin/pages/functions/_indicatorThree.php';
include 'app/views/admin/pages/functions/indicatorThree.php';
include 'app/views/admin/pages/functions/indicatorFour.php';
include 'app/views/admin/pages/functions/_indicatorFour.php';
include 'app/views/admin/pages/functions/indicatorFive.php';





?>


<div class="row">
    <div class="col-md-12">
        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#indicadoresModal">
        Avaliar
        </button>
    </div>
</div>

<!-- Indicador 1 -->
<div class="row">
    <div class="col-md-12">
        <h3>1 - Ambiente Aconchegante (Peso da Classe: <?= $pesoClasseOne ?>%)</h3>
    </div>
    <?php
    // Obter dados para a visualização (já foi chamado antes)
    // obterDadosAmbienteAconchegante(1, 2024, $conn);

    $lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

    foreach ($lojas as $loja) {
        // Uso de variáveis variáveis para acessar os dados de cada loja
        $reposicaoCafe = ${'reposicaoCafe' . $loja};
        $boloBebidasComidas = ${'boloBebidasComidas' . $loja};
        $embalagens = ${'embalagens' . $loja};
        $mezanino = ${'mezanino' . $loja};

        // Pega a nota final
        $notaFinal = calcularNotaFinalLojaUm($reposicaoCafe, $boloBebidasComidas, $embalagens, $mezanino, $pesoClasseOne);
    ?>

    <div class="col-md-3">
        <div class="card">
            <div class="content row">
                <div class="col-md-7">
                    <h5>Loja <?= $loja ?></h5>
                    <p class="title">Nota Final: <?= $notaFinal ?>%</p>
                </div>
                <div class="col-md-5">
                    <?php
                    $faltando = false;

                    if (
                        calcularNotaItemSimNao($reposicaoCafe, $pesoReposicaoCafe) != 25 ||
                        calcularNotaItemSimNao($boloBebidasComidas, $pesoBoloBebidasComidas) != 25 ||
                        calcularNotaItemSimNao($embalagens, $pesoEmbalagens) != 25 ||
                        calcularNotaItemSimNao($mezanino, $pesoMezanino) != 25
                    ) {
                        $faltando = true;
                    }

                    if ($faltando) {
                    ?>
                        <small>em falta: </small> <br>
                        <?php
                        if (calcularNotaItemSimNao($reposicaoCafe, $pesoReposicaoCafe) != 25) {
                        ?>
                            <small class="">Reposição Café.</small><br>
                        <?php } ?>

                        <?php
                        if (calcularNotaItemSimNao($boloBebidasComidas, $pesoBoloBebidasComidas) != 25) {
                        ?>
                            <small class="">Bolo, Bebidas e Comidas.</small><br>
                        <?php } ?>

                        <?php
                        if (calcularNotaItemSimNao($embalagens, $pesoEmbalagens) != 25) {
                        ?>
                            <small class="">Embalagens.</small><br>
                        <?php } ?>

                        <?php
                        if (calcularNotaItemSimNao($mezanino, $pesoMezanino) != 25) {
                        ?>
                            <small class="">Mezanino desorganizado.</small>
                        <?php } ?>
                    <?php } ?>
                </div>
            </div>
        </div>
    </div>

    <?php } ?>
</div>



<!-- Indicador 2 - Time de Especialistas (25%) -->
<?php
$mes = 1;  // Mês de janeiro como exemplo
$ano = 2024;  // Ano
obterDadosTimeEspecialistas($mes, $ano, $conn);
?>
<div class="row">

    <div class="col-md-12">
        <h3>2 - Time de Especialistas (Peso da Classe: <?= $pesoClasseTwo ?>%)</h3>
    </div>
    <?php


    // Exemplo de valor da taxa de equilíbrio para 100% (meta)
    $metaTaxaEquilibrio = 40; // Isso pode vir de uma consulta ao banco de dados

    $lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

    foreach ($lojas as $loja) {
        // Obter os valores das variáveis específicas de cada loja
        $taxaEquilibrio = ${'taxaEquilibrio' . $loja};
        $desenvolvimentoLideres = ${'desenvolvimentoLideres' . $loja};

        // Obter as notas de satisfação e STI específicas de cada loja
        $notaSatisfacao = ${'satisfacaoGeral' . $loja};
        $notaSTI = ${'notaSTI' . $loja};

        // Calcular a nota ponderada de Pesquisa 360
        $notaPonderadaPesquisa360 = ($notaSatisfacao / 10) * 25;

        // Calcular a nota ponderada da Nota STI
        $notaPonderadaSTI = ($notaSTI / 10) * 25;

        // Calcular a nota ponderada de Desenvolvimento de Líderes
        $notaPonderadaLideres = ($desenvolvimentoLideres / 10) * $pesoDesenvolvimentoLideres;

        // Calcular a nota ponderada da Taxa de Equilíbrio
        if ($taxaEquilibrio <= $metaTaxaEquilibrio) {
            $notaEquilibrio = 100;
        } elseif ($taxaEquilibrio >= 100) {
            $notaEquilibrio = 0;
        } else {
            $notaEquilibrio = 100 - (($taxaEquilibrio - $metaTaxaEquilibrio) / (100 - $metaTaxaEquilibrio)) * 100;
        }
        $notaPonderadaEquilibrio = ($notaEquilibrio / 100) * $pesoTaxaEquilibrio;

        // Somar todas as notas ponderadas
        $notaFinal = ($notaPonderadaPesquisa360 + $notaPonderadaSTI + $notaPonderadaLideres + $notaPonderadaEquilibrio) * ($pesoClasseTwo / 100);
    ?>

        <div class="col-md-3">
            <div class="card">
                <div class="content">
                    <h5 class="title"><?= $loja ?></h5>
                    <p class="">Nota 360 no peso: <?= number_format($notaPonderadaPesquisa360, 2) ?>%</p>
                    <p class="">Nota STI no peso: <?= number_format($notaPonderadaSTI, 2) ?>%</p>
                    <p class="">Nota Líderes no peso: <?= number_format($notaPonderadaLideres, 2) ?>%</p>
                    <p class="">Nota Equilíbrio no peso: <?= number_format($notaPonderadaEquilibrio, 2) ?>%</p>
                    <p class="title">Nota Final: <?= number_format($notaFinal, 2) ?>%</p>
                </div>
            </div>
        </div>

    <?php } ?>
</div>




<!-- Indicador 3 new -->
<div class="row">
    <div class="col-md-12">
        <h3>3 - Qualidade de Produtos e Serviços (10%)</h3>
    </div>
    <?php
    obterDadosQualidadeProdutosServicos(1, 2024, $conn);
    obterMetasNpsTotal(1, 2024, $conn);

    $lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

    foreach ($lojas as $loja) {
        // Uso de variáveis variáveis para acessar os dados de cada loja
        $npsServico = ${'npsServico' . $loja};
        $npsTotal = ${'npsTotal' . $loja};

        // Pega a nota final calculada
        $notaFinalNps = calcularNotaNps($npsServico, $npsTotal, $pesoClasseThree);
    ?>

        <div class="col-md-3">
            <div class="card">
                <div class="content">
                    <h5><?= $loja ?></h5>
                    <p class="title">NPS Serviço: <?= $npsServico; ?> de <?= $npsTotal ?> (Peso: <?= $pesoClasseThree ?>%)</p>
                    <p class="title">Nota Final: <?= $notaFinalNps ?>%</p>
                </div>
            </div>
        </div>

    <?php } ?>
</div>

<!-- Indicador 4 new -->
<div class="row">
    <div class="col-md-12">
        <h3>4 - Posicionamento e Branding (15%)</h3>
    </div>
    <?php
    obterMetasRetornoPosVenda(1, 2024, $conn);
    obterDadosPosicionamentoBranding(1, 2024, $conn);

    $lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

    foreach ($lojas as $loja) {
        // Uso de variáveis variáveis para acessar os dados de cada loja
        $retornoPosVenda = ${'retornoPosVenda' . $loja};
        $metaRetornoPosVenda = ${'metaRetornoPosVenda' . $loja};
        $vitrinesTvsPadrao = ${'vitrinesTvsPadrao' . $loja};
        $mimosLoja = ${'mimosLoja' . $loja};
        $dressCode = ${'dressCode' . $loja};

        $calculoRetornoPosVenda = calcularNotaRetornoPosVenda($retornoPosVenda, $metaRetornoPosVenda, $pesoRetornoPosVenda);

        // Pega a nota final
        $notaFinal = calcularNotaFinalLojaQuatro($calculoRetornoPosVenda, $vitrinesTvsPadrao, $mimosLoja, $dressCode, $pesoClasseFour);
    ?>

        <div class="col-md-3">
            <div class="card">
                <div class="content">
                    <h5><?= $loja ?></h5>
                    <p class="">
                        Retorno Pós Venda: <?= $retornoPosVenda ?> de <?= $metaRetornoPosVenda ?> e peso do item: <?= $pesoRetornoPosVenda ?>
                    </p>
                    <p class="title">Retorno Pós Venda: <?= $calculoRetornoPosVenda ?>%</p>
                    <p class="title">Vitrines e TVs Padrão: <?= calcularNotaItem($vitrinesTvsPadrao, $pesoVitrinesTvsPadrao); ?>%</p>
                    <p class="title">Mimos Disponíveis: <?= calcularNotaItem($mimosLoja, $pesoMimosLoja); ?>%</p>
                    <p class="title">Dress Code: <?= calcularNotaItem($dressCode, $pesoDressCode); ?>%</p>
                    <p>Média Final: <?= $notaFinal ?>%</p>
                </div>
            </div>
        </div>

    <?php } ?>
</div>

<?php
// Chamando as funções para obter os dados
obterDadosIndicadores(1, 2024, $conn);
obterMetasIndicadores(1, 2024, $conn);
?>
<div class="row">
    <div class="col-md-12">
        <h3>5 - Indicadores de Resultado (<?= formatarNumero($pesoClasseFive) ?>%)</h3>
    </div>
    <?php
    obterDadosIndicadores(1, 2024, $conn);
    obterMetasIndicadores(1, 2024, $conn);

    $lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

    foreach ($lojas as $loja) {
        // Uso de variáveis variáveis para acessar os dados de cada loja
        $metaBatida = ${'metaBatida' . $loja};
        $metaAlvo = ${'meta' . $loja};
        $ticketMedio = ${'ticketMedio' . $loja};
        $ticketMedioAlvo = ${'ticketMedioMeta' . $loja};
        $percentualDesc = ${'percentualDesc' . $loja};
        $percentualDescAlvo = ${'percentualDescMeta' . $loja};

        // Calcula as notas
        $notaMetaBatida = calcularNotaMetaBatida($metaBatida, $metaAlvo, $pesoMeta);
        $notaTicketMedio = calcularNotaTicketMedio($ticketMedio, $ticketMedioAlvo, $pesoTicketMedio);
        $notaPercentualDesconto = calcularNotaPercentualDesconto($percentualDesc, $percentualDescAlvo, $pesoPercentualDesc);

        // Pega a nota final
        $notaFinal = calcularNotaFinalLoja($notaMetaBatida, $notaTicketMedio, $notaPercentualDesconto, $pesoClasseFive);
    ?>

        <div class="col-md-3">
            <div class="card">
                <div class="content">
                    <h5><?= $loja ?></h5>
                    <p class="title">Meta: <?= $metaBatida; ?> de <?= $metaAlvo ?> </p>
                    <p class="title">
                        Nota Meta Batida: <?= $notaMetaBatida ?>%
                    </p>
                    <p class="title">Ticket: <?= $ticketMedio; ?> de <?= $ticketMedioAlvo ?></p>
                    <p class="title">
                        Nota Ticket Médio: <?= $notaTicketMedio ?>%
                    </p>
                    <p class="title">Desconto %: <?= $percentualDesc; ?> de <?= $percentualDescAlvo ?></p>
                    <p class="title">
                        Nota Percentual Desconto: <?= $notaPercentualDesconto ?>%
                    </p>

                    <p> média final: <?= $notaFinal ?>%</p>
                </div>
            </div>
        </div>

    <?php } ?>
</div>


<div class="modal fade" id="indicadoresModal" tabindex="-1" role="dialog" aria-labelledby="indicadoresModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="indicadoresModalLabel">Inserir Indicadores</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <form id="indicadoresForm" action="/back/indicadores.php" method="POST" enctype="multipart/form-data">


                    <!-- Avaliador (não editável, preenchido automaticamente pela sessão) -->
                    <div class="row mb-3">
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="avaliador" name="avaliador" value="<?= htmlspecialchars($_SESSION['name']); ?>" readonly>
                            <label for="avaliador">Avaliador</label>
                        </div>

                        <!-- Loja (select) -->
                        <div class="col-md-3 form-floating">
                            <select class="form-control" id="loja" name="loja" required>
                                <option value="">Selecione a loja</option>
                                <option selected value="Riomar">Riomar</option>
                                <option value="Jardins">Jardins</option>
                                <option value="Garcia">Garcia</option>
                                <option value="Treze">Treze</option>
                            </select>
                            <label for="loja">Loja</label>
                        </div>

                        <!-- Mês da Avaliação (select) -->
                        <div class="col-md-3 form-floating">
                            <select class="form-control" id="mes" name="mes" required>
                                <option value="">Selecione o mês</option>
                                <option selected value="1">Janeiro</option>
                                <option value="2">Fevereiro</option>
                                <option value="3">Março</option>
                                <option value="4">Abril</option>
                                <option value="5">Maio</option>
                                <option value="6">Junho</option>
                                <option value="7">Julho</option>
                                <option value="8">Agosto</option>
                                <option value="9">Setembro</option>
                                <option value="10">Outubro</option>
                                <option value="11">Novembro</option>
                                <option value="12">Dezembro</option>
                            </select>
                            <label for="mes">Mês da Avaliação</label>
                        </div>

                        <!-- ano da avaliação -->
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="year" name="year" value="<?= date('Y'); ?>" readonly>
                            <label for="year">Ano</label>
                        </div>
                    </div>

                    <!-- Seção 1: Ambiente Aconchegante (15%) -->
                    <h5 class="title-indicator my-3">1. Ambiente Aconchegante (15%)</h5>

                    <div class="row align-items-center mb-4">
                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="reposicao_cafe" name="reposicao_cafe" checked>
                                <label class="form-check-label" for="reposicao_cafe">Reposição de café</label>
                            </div>
                        </div>
                        <div class="col-md-3" style="display: none;">
                            <input type="file" class="form-control" id="reposicao_cafe_imagem" name="reposicao_cafe_imagem">
                            <label for="reposicao_cafe_imagem">Imagem (se Não)</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="bolo_bebidas_comidas" name="bolo_bebidas_comidas" checked>
                                <label class="form-check-label" for="bolo_bebidas_comidas">Bolo / Bebidas / Comidas</label>
                            </div>
                        </div>
                        <div class="col-md-3" style="display: none;">
                            <input type="file" class="form-control" id="bolo_bebidas_comidas_imagem" name="bolo_bebidas_comidas_imagem">
                            <label for="bolo_bebidas_comidas_imagem">Imagem (se Não)</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="embalagens" name="embalagens" checked>
                                <label class="form-check-label" for="embalagens">Embalagens certas</label>
                            </div>
                        </div>
                        <div class="col-md-3" style="display: none;">
                            <input type="file" class="form-control" id="embalagens_imagem" name="embalagens_imagem">
                            <label for="embalagens_imagem">Imagem (se Não)</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="mezanino" name="mezanino" checked>
                                <label class="form-check-label" for="mezanino">Mezanino Organizado</label>
                            </div>
                        </div>
                        <div class="col-md-3" style="display: none;">
                            <input type="file" class="form-control" id="mezanino_imagem" name="mezanino_imagem">
                            <label for="mezanino_imagem">Imagem (se Não)</label>
                        </div>
                    </div>

                    <!-- Seção 2: Time de Especialistas (25%) -->
                    <h5 class="title-indicator my-3">2. Time de Especialistas (25%)</h5>

                    <div class="row mb-3">
                        <div class="col-md-3 form-floating">
                            <input type="number" step="0.01" class="form-control" id="taxa_equilibrio_time" value="30" name="taxa_equilibrio_time" placeholder=" " required>
                            <label for="taxa_equilibrio_time">Taxa de equilíbrio entre o time</label>
                        </div>
                        <div class="col-md-3 form-floating">
                            <input type="number" readonly step="0.01" class="form-control" id="nota_media_sti" value="8" name="nota_media_sti" required placeholder=" ">
                            <label for="nota_media_sti">Média Provas S.T.I</label>
                        </div>
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="desenvolvimento_lideres" value="10" name="desenvolvimento_lideres" required placeholder=" ">
                            <label for="desenvolvimento_lideres">Desenvolvimento de Líderes</label>
                        </div>
                        <div class="col-md-3 form-floating">
                            <input type="number" readonly step="0.01" class="form-control" id="pesquisa_360" value="3" name="pesquisa_360" required placeholder=" ">
                            <label for="pesquisa_360">Pesquisa 360 (NPS)</label>
                        </div>
                    </div>

                    <!-- Seção 3: Qualidade incontestável dos produtos e serviços (10%) -->
                    <h5 class="title-indicator my-3">3. Qualidade incontestável dos produtos e serviços (10%)</h5>

                    <div class="row align-items-center mb-4">
                        <div class="col-md-12 form-floating">
                            <input type="number" step="0.01" class="form-control" id="nps_servico" value="4" name="nps_servico" required placeholder=" ">
                            <label for="nps_servico">NPS ligado a serviço</label>
                        </div>
                    </div>

                    <!-- Seção 4: Posicionamento e Branding (15%) -->
                    <h5 class="title-indicator my-3">4. Posicionamento e Branding (15%)</h5>

                    <div class="row align-items-center mb-4">
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="retorno_pos_venda" name="retorno_pos_venda" value="10" required placeholder="">
                            <label class="form-check-label" for="retorno_pos_venda">Retorno do Pós Venda</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="vitrines_tvs_padrao" name="vitrines_tvs_padrao" checked>
                                <label class="form-check-label" for="vitrines_tvs_padrao">Vitrines e TVs dentro do Padrão</label>
                            </div>
                        </div>
                        <div class="col-md-6" style="display: none;">
                            <input type="file" class="form-control" id="vitrines_tvs_padrao_imagem" name="vitrines_tvs_padrao_imagem">
                            <label for="vitrines_tvs_padrao_imagem">Imagem (se Não)</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="mimos_loja" name="mimos_loja" checked>
                                <label class="form-check-label" for="mimos_loja">Ter mimos disponíveis em loja</label>
                            </div>
                        </div>
                        <div class="col-md-6" style="display: none;">
                            <input type="file" class="form-control" id="mimos_loja_imagem" name="mimos_loja_imagem">
                            <label for="mimos_loja_imagem">Imagem (se Não)</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="dress_code" name="dress_code" checked>
                                <label class="form-check-label" for="dress_code">Dress code</label>
                            </div>
                        </div>
                        <div class="col-md-6" style="display: none;">
                            <input type="file" class="form-control" id="dress_code_imagem" name="dress_code_imagem">
                            <label for="dress_code_imagem">Imagem (se Não)</label>
                        </div>
                    </div>

                    <!-- Seção 5: Indicadores de Resultado (35%) -->
                    <h5 class="title-indicator my-3">5. Indicadores de Resultado (35%)</h5>

                    <div class="row align-items-center mb-4">
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="meta_batida" name="meta_batida" value="100" required placeholder="">
                            <label class="form-check-label" for="meta_batida">Meta mensal %</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="ticket_medio" value="1875.00" name="ticket_medio" required placeholder="">
                            <label class="form-check-label" for="ticket_medio">Ticket médio</label>
                        </div>

                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="percentual_desconto_medio" value="10" name="percentual_desconto_medio" required placeholder="">
                            <label class="form-check-label" for="percentual_desconto_medio">Percentual de desconto médio</label>
                        </div>
                    </div>
            </div>

            <div class="modal-footer">
                <button type="submit" class="btn btn-primary">Salvar Indicadores</button>
            </div>
            </form>
        </div>

    </div>
</div>

<!-- Gráficos -->

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
    // Labels que representam as lojas
    var labelsLojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

    // Aqui, os dados que você já calculou anteriormente no PHP
    var reposicaoCafe = [
        <?= calcularNotaItemSimNao($reposicaoCafeRiomar, $pesoReposicaoCafe) ?>,
        <?= calcularNotaItemSimNao($reposicaoCafeJardins, $pesoReposicaoCafe) ?>,
        <?= calcularNotaItemSimNao($reposicaoCafeGarcia, $pesoReposicaoCafe) ?>,
        <?= calcularNotaItemSimNao($reposicaoCafeTreze, $pesoReposicaoCafe) ?>
    ];

    var boloBebidasComidas = [
        <?= calcularNotaItemSimNao($boloBebidasComidasRiomar, $pesoBoloBebidasComidas) ?>,
        <?= calcularNotaItemSimNao($boloBebidasComidasJardins, $pesoBoloBebidasComidas) ?>,
        <?= calcularNotaItemSimNao($boloBebidasComidasGarcia, $pesoBoloBebidasComidas) ?>,
        <?= calcularNotaItemSimNao($boloBebidasComidasTreze, $pesoBoloBebidasComidas) ?>
    ];

    var embalagens = [
        <?= calcularNotaItemSimNao($embalagensRiomar, $pesoEmbalagens) ?>,
        <?= calcularNotaItemSimNao($embalagensJardins, $pesoEmbalagens) ?>,
        <?= calcularNotaItemSimNao($embalagensGarcia, $pesoEmbalagens) ?>,
        <?= calcularNotaItemSimNao($embalagensTreze, $pesoEmbalagens) ?>
    ];

    var mezanino = [
        <?= calcularNotaItemSimNao($mezaninoRiomar, $pesoMezanino) ?>,
        <?= calcularNotaItemSimNao($mezaninoJardins, $pesoMezanino) ?>,
        <?= calcularNotaItemSimNao($mezaninoGarcia, $pesoMezanino) ?>,
        <?= calcularNotaItemSimNao($mezaninoTreze, $pesoMezanino) ?>
    ];

    // Configuração do gráfico de barras agrupadas
    var ctx = document.getElementById('graficoAmbienteAconchegante').getContext('2d');
    var graficoAmbienteAconchegante = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsLojas, // Lojas como labels no eixo X
            datasets: [{
                    label: 'Reposição Café',
                    data: reposicaoCafe,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Bolo, Bebidas e Comidas',
                    data: boloBebidasComidas,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Embalagens',
                    data: embalagens,
                    backgroundColor: 'rgba(255, 206, 86, 0.6)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Mezanino',
                    data: mezanino,
                    backgroundColor: 'rgba(153, 102, 255, 0.6)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Nota (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Lojas'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            return tooltipItem.dataset.label + ': ' + tooltipItem.raw + '%';
                        }
                    }
                }
            }
        }
    });
</script>




<!-- end gráficos -->
<script>
    document.getElementById('loja').addEventListener('change', function() {
        // Obtenha o valor da loja selecionada
        var lojaSelecionada = this.value;

        // Defina as variáveis do PHP no JavaScript
        var mediaRiomar = <?php echo json_encode($satisfacaoGeralRiomar); ?>;
        var mediaJardins = <?php echo json_encode($satisfacaoGeralJardins); ?>;
        var mediaGarcia = <?php echo json_encode($satisfacaoGeralGarcia); ?>;
        var mediaTreze = <?php echo json_encode($satisfacaoGeralTreze); ?>;

        // Determine qual valor usar com base na loja selecionada
        var mediaSelecionada;
        switch (lojaSelecionada) {
            case 'Riomar':
                mediaSelecionada = mediaRiomar;
                break;
            case 'Jardins':
                mediaSelecionada = mediaJardins;
                break;
            case 'Garcia':
                mediaSelecionada = mediaGarcia;
                break;
            case 'Treze':
                mediaSelecionada = mediaTreze;
                break;
            default:
                mediaSelecionada = '';
                break;
        }

        // Atualize o campo "Pesquisa 360 (NPS)" com o valor selecionado
        document.getElementById('pesquisa_360').value = mediaSelecionada;
    });

    // Preenche o ano automaticamente
    var currentYear = new Date().getFullYear();
    document.getElementById('year').value = currentYear;
</script>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        const switchElements = document.querySelectorAll('.custom-control-input');

        switchElements.forEach(function(switchElement) {
            switchElement.addEventListener('change', function() {
                const imageField = document.getElementById(switchElement.id + 'Image');
                if (switchElement.checked) {
                    imageField.style.display = 'none';
                } else {
                    imageField.style.display = 'block';
                }
            });
        });
    });
</script>

<script>
    $(document).ready(function() {
        $('#indicadoresForm').on('submit', function(event) {
            event.preventDefault(); // Impede o envio padrão do formulário

            var formData = new FormData(this);

            // Enviar o formulário via AJAX
            $.ajax({
                url: '../back/admin/indicadores.php',
                type: 'POST',
                data: formData,
                contentType: false,
                processData: false,
                success: function(response) {
                    alert(response); // Exibir mensagem de sucesso ou erro
                    // Pode incluir lógica para limpar o formulário ou fechar o modal
                },
                error: function(xhr, status, error) {
                    alert('Erro ao enviar os dados: ' + error);
                }
            });
        });

        // Lógica para exibir o input de imagem quando o switch é desmarcado
        $('.form-check-input[type="checkbox"]').on('change', function() {
            var fileInput = $(this).closest('.col-md-3').next().find('input[type="file"]');
            if (this.checked) {
                fileInput.closest('.col-md-3').hide();
                fileInput.prop('required', false);
            } else {
                fileInput.closest('.col-md-3').show();
                fileInput.prop('required', true);
            }
        });
    });
</script>