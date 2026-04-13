<div id="indicator-4" class="row indicator">
    <div class="col-md-12 col-lg-6 mt-4">
        <div class="card h-100">
            <div class="content">
                <h3>4 - Posicionamento e Branding (<?= $dadosIndicador4['peso_classe'] ?>%)</h3>
                <div id="chartIndicator4"></div>
            </div>
        </div>
    </div>
    <div class="col-md-12 col-lg-6">
        <div class="h-100">
            <div class="content">
                <h5 class="title">Itens avaliados nesse indicador</h5>
                <ul class="list d-flex gap-5">
                    <li>
                        <p class="text">Retorno do Pós Venda</p>
                    </li>
                    <li>
                        <p class="text">Vitrines e TVs no Padrão</p>
                    </li>
                    <li>
                        <p class="text">Mimos disponíveis</p>
                    </li>
                    <li>
                        <p class="text">Dress code</p>
                    </li>
                </ul>
                <div class="row">
                    <?php foreach ($dadosIndicador4['lojas'] as $loja => $info): ?>
                        <div class="col-md-6 mt-4">
                            <div class="card card-stores h-100 <?= $loja ?>">
                                <div class="content">
                                    <h5><?= $loja ?></h5>

                                    <?php
                                    // dados brutos
                                    $retornoPosVenda     = $info['retorno_raw'];          // %
                                    $metaRetornoPosVenda = $info['meta_retorno'];         // %
                                    $vitrinesTvsPadrao   = $info['vitrines_raw'];         // 0/1
                                    $mimosLoja           = $info['mimos_raw'];            // 0/1
                                    $dressCode           = $info['dresscode_raw'];        // 0/1

                                    // imagens (opcionais)
                                    $imgVitrines = $info['imagem_vitrines'];
                                    $imgMimos    = $info['imagem_mimos'];
                                    $imgDress    = $info['imagem_dress'];
                                    ?>

                                    <?php if (
                                        is_null($retornoPosVenda) &&
                                        is_null($vitrinesTvsPadrao) &&
                                        is_null($mimosLoja) &&
                                        is_null($dressCode)
                                    ): ?>
                                        <p class="title">Indicadores <br> não registrados</p>

                                    <?php else: ?>

                                        <!-- Retorno Pós‑venda -->
                                        <p>
                                            Retorno Pós‑venda: <?= $retornoPosVenda ?>%
                                            <?php if ($retornoPosVenda >= $metaRetornoPosVenda): ?>
                                                <small style="color:green;">Bateu a meta</small>
                                            <?php else: ?>
                                                <small style="color:red;">Não bateu a meta</small>
                                            <?php endif; ?>
                                        </p>

                                        <?php
                                        /* Verifica itens cumpridos ---------------------------------- */
                                        if ($vitrinesTvsPadrao && $mimosLoja && $dressCode) {
                                            echo '<p>Todos itens cumpridos</p>';
                                        } else {
                                            echo '<small style="color:red;">Itens não cumpridos:</small>';
                                            echo '<ul class="list d-flex gap-4">';

                                            if (!$vitrinesTvsPadrao) {
                                                echo '<li>';
                                                echo $imgVitrines
                                                    ? '<a class="chocolat-image link-btn" href="../upload-indicadores/' . $imgVitrines . '" target="_blank">
                                  <small>Vitrines e TVs Padrão <span class="icon-see material-symbols-outlined">visibility</span></small>
                              </a>'
                                                    : '<small>Vitrines e TVs Padrão</small>';
                                                echo '</li>';
                                            }

                                            if (!$mimosLoja) {
                                                echo '<li>';
                                                echo $imgMimos
                                                    ? '<a class="chocolat-image link-btn" href="../upload-indicadores/' . $imgMimos . '" target="_blank">
                                  <small>Mimos Disponíveis <span class="icon-see material-symbols-outlined">visibility</span></small>
                              </a>'
                                                    : '<small>Mimos Disponíveis</small>';
                                                echo '</li>';
                                            }

                                            if (!$dressCode) {
                                                echo '<li>';
                                                echo $imgDress
                                                    ? '<a class="chocolat-image link-btn" href="../upload-indicadores/' . $imgDress . '" target="_blank">
                                  <small>Dress Code <span class="icon-see material-symbols-outlined">visibility</span></small>
                              </a>'
                                                    : '<small>Dress Code</small>';
                                                echo '</li>';
                                            }

                                            echo '</ul>';
                                        }
                                        ?>

                                        <!-- Nota final bruta (antes do peso‑classe) -->
                                        <p class="title">
                                            Média Final: <?= number_format($info['nota_final_bruta_media'], 2, ',', '.') ?>%
                                        </p>
                                        <!-- Se quiser mostrar a ponderada: <?=/*number_format($info['media_final'],2,',','.')*/ '' ?> -->

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