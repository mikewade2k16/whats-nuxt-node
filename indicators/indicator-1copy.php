<!-- Indicador 1 -->
<div class="row">
    <?php
    // Inicialize arrays para armazenar os nomes das lojas e suas respectivas notas finais
    $notasFinais = []; // Array para armazenar as notas finais
    ?>
    <div class="col-md-6 ">
        <div class="card h-100">
            <div class="content">
                <h3>1 - Ambiente Aconchegante (<?= $pesoClasseOne ?>%)</h3>
                <div class="chart-indicator" id="chartIndicator1"></div>
            </div>
        </div>

    </div>
    <div class="col-md-6">
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
                    <?php foreach ($lojas as $loja) { ?>
                        <div class="col-md-6 mb-md-4 mb-3">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content row">
                                    <div class="col-md-12">
                                        <h5><?= $loja ?></h5>

                                        <?php
                                        // Buscar se existem avaliações para a loja no mês e ano selecionados
                                        //$sqlVerificaAvaliacao = "SELECT COUNT(*) as total FROM avaliacoes WHERE loja = ? AND mes = ? AND ano = ?";
                                        $sqlVerificaAvaliacao = "SELECT COUNT(*) as total FROM avaliacoes WHERE loja = ? AND NOT (end_date < ? OR start_date > ?)";
                                        $stmtVerifica = $conn->prepare($sqlVerificaAvaliacao);
                                        //$stmtVerifica->bind_param("sii", $loja, $mes, $ano);
                                        $stmtVerifica->bind_param("sss", $loja, $startDate, $endDate);
                                        $stmtVerifica->execute();
                                        $resultVerifica = $stmtVerifica->get_result();
                                        $rowVerifica = $resultVerifica->fetch_assoc();
                                        $stmtVerifica->close();

                                        if ($rowVerifica['total'] == 0) {
                                            echo '<p class="title">Indicadores não registrados</p>';
                                        } else {
                                            if (!isset($itensFaltandoPorLoja[$loja]) || empty($itensFaltandoPorLoja[$loja])) {
                                                echo '<p class="title">Todos os itens foram cumpridos</p>';
                                            } else {
                                        ?>
                                                <p class="">Itens faltantes:</p>
                                                <ul class="list d-flex flex-wrap justify-content-start align-items-start w-100">
                                                    <?php
                                                    // echo '<p class="title">Itens faltantes:</p>';
                                                    //  echo '<ul>';

                                                    $itensUnicos = [];
                                                    $imagensPorAvaliacao = [];

                                                    foreach ($itensFaltandoPorLoja[$loja] as $avaliacaoId => $dados) {
                                                        // Buscar nome do avaliador e data de atualização
                                                        $sqlAvaliador = "SELECT avaliador, updated_at FROM avaliacoes WHERE id = ?";
                                                        $stmtAvaliador = $conn->prepare($sqlAvaliador);
                                                        $stmtAvaliador->bind_param("i", $avaliacaoId);
                                                        $stmtAvaliador->execute();
                                                        $resultAvaliador = $stmtAvaliador->get_result();
                                                        $avaliacaoInfo = $resultAvaliador->fetch_assoc();
                                                        $stmtAvaliador->close();

                                                        $nomeAvaliador = $avaliacaoInfo['avaliador'] ?? 'Desconhecido';
                                                        $dataAtualizacao = isset($avaliacaoInfo['updated_at']) ? date('d/m/Y H:i', strtotime($avaliacaoInfo['updated_at'])) : 'Data não disponível';

                                                        foreach ($dados['itens'] as $item) {
                                                            if (!in_array($item, $itensUnicos)) {
                                                                $itensUnicos[] = $item;
                                                    ?>
                                                                <li class="ms-3 w-100"><?= $item ?></li>
                                                        <?php

                                                            }
                                                        }

                                                        if (!empty($dados['imagens'])) {
                                                            $imagensComItem = [];

                                                            foreach ($dados['imagens'] as $index => $imagem) {
                                                                $nomeItem = $dados['itens'][$index] ?? 'Item não identificado';
                                                                $imagensComItem[] = [
                                                                    'item' => $nomeItem,
                                                                    'imagem' => $imagem
                                                                ];
                                                            }

                                                            $imagensPorAvaliacao[] = [
                                                                'avaliador' => $nomeAvaliador,
                                                                'data' => $dataAtualizacao,
                                                                'imagens' => $imagensComItem
                                                            ];
                                                        }
                                                    }
                                                    echo '</ul>';

                                                    if (!empty($imagensPorAvaliacao)) { ?>
                                                        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modalImagens-<?= $loja ?>">
                                                            Ver Imagens
                                                        </button>
                                            <?php }
                                                }
                                            }
                                            ?>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Modal de Imagens separado por loja e avaliações -->
                        <?php if (!empty($imagensPorAvaliacao)) { ?>
                            <div class="modal fade" id="modalImagens-<?= $loja ?>" tabindex="-1" role="dialog">
                                <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable" role="document">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h5 class="modal-title">Imagens dos Itens Faltando - <?= $loja ?></h5>
                                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                        </div>
                                        <div class="modal-body">
                                            <div class="row">
                                                <?php foreach ($imagensPorAvaliacao as $dados) { ?>
                                                    <?php foreach ($dados['imagens'] as $infoImagem) { ?>
                                                        <div class="col-auto">
                                                            <div class="card-details">
                                                                <div class="card-title">
                                                                    <h5>Avaliador: <?= $dados['avaliador'] ?></h5>
                                                                    <h6>Data Avaliação: <?= $dados['data'] ?></h6>
                                                                </div>
                                                                <div class="card-content">
                                                                    <h6> <?= $infoImagem['item'] ?></h6>
                                                                    <img src="../upload-indicadores/<?= $infoImagem['imagem'] ?>" class="img-fluid" style="width: 250px; object-fit: cover;">
                                                                </div>
                                                            </div>
                                                        </div>
                                                    <?php } ?>
                                                <?php } ?>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        <?php } ?>
                    <?php } ?>
                </div>
            </div>
        </div>
    </div>

</div>