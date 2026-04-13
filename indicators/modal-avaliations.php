<!-- Modal com seleção de indicadores 
<div class="modal fade" id="indicadoresModal" tabindex="-1" role="dialog" aria-labelledby="indicadoresModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="indicadoresModalLabel">Avaliar Indicadores</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>

            <div class="modal-body">


                <!-- Avaliador (não editável, preenchido automaticamente pela sessão) 
                <div class="row mb-3">
                    <div class="col-md-3 form-floating">
                        <input type="text" class="form-control" id="avaliador" name="avaliador" value="<?= htmlspecialchars($_SESSION['name']); ?>" readonly>
                        <label for="avaliador">Avaliador</label>
                    </div>

                    <!-- Loja (select) 
                    <div class="col-md-3 form-floating">
                        <select class="form-control" id="loja" name="loja" required>
                            <option value="">Selecione a loja</option>
                            <option value="Riomar">Riomar</option>
                            <option value="Jardins">Jardins</option>
                            <option value="Garcia">Garcia</option>
                            <option value="Treze">Treze</option>
                        </select>
                        <label for="loja">Loja</label>
                    </div>

                    <!-- Data picker 
                    <div class="col-md-3 ">
                        <label for="periodo">Período da Avaliação</label>
                        <input type="text" class="form-control" name="periodo" id="periodo" required />
                    </div>



                </div>


                <!-- Seção 1: Ambiente Aconchegante (15%) -- 
                <h5 class="title-indicator my-3">1. Ambiente Aconchegante (15%)</h5>

                <div class="row align-items-center mb-4">
                    <div class="col-md-3 form-floating">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="reposicao_cafe" name="reposicao_cafe" checked>
                            <label class="form-check-label" for="reposicao_cafe">Reposição de café</label>
                            <input type="file" style="display: none;" class="form-control" id="reposicao_cafe_imagem" name="reposicao_cafe_imagem">
                        </div>
                    </div>

                    <div class="col-md-3 form-floating">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="bolo_bebidas_comidas" name="bolo_bebidas_comidas" checked>
                            <label class="form-check-label" for="bolo_bebidas_comidas">Bolo / Bebidas / Comidas</label>
                            <input type="file" style="display: none;" class="form-control" id="bolo_bebidas_comidas_imagem" name="bolo_bebidas_comidas_imagem">
                        </div>
                    </div>

                    <div class="col-md-3 form-floating">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="embalagens" name="embalagens" checked>
                            <label class="form-check-label" for="embalagens">Embalagens certas</label>
                            <input type="file" style="display: none;" class="form-control" id="embalagens_imagem" name="embalagens_imagem">
                        </div>
                    </div>

                    <div class="col-md-3 form-floating">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="mezanino" name="mezanino" checked>
                            <label class="form-check-label" for="mezanino">Mezanino Organizado</label>
                            <input type="file" style="display: none;" class="form-control" id="mezanino_imagem" name="mezanino_imagem">
                        </div>

                    </div>
                </div>
                <!-- Seção 2: Time de Especialistas (25%) 
                <h5 class="title-indicator my-3">2. Time de Especialistas (25%)</h5>

                <div class="row mb-3">
                    <div class="col-md-3 form-floating">
                        <input type="number" step="0.01" class="form-control" id="taxa_equilibrio_time" value="30" name="taxa_equilibrio_time" placeholder=" " required>
                        <label for="taxa_equilibrio_time">Taxa de equilíbrio entre o time</label>
                    </div>
                    <div class="col-md-3 form-floating">
                        <input type="number" readonly step="0.01" class="form-control" id="nota_media_sti" value="" name="nota_media_sti" required placeholder=" ">
                        <label for="nota_media_sti">Média Provas S.T.I</label>
                    </div>
                    <div class="col-md-3 form-floating">
                        <input type="text" class="form-control" id="desenvolvimento_lideres" value="10" name="desenvolvimento_lideres" required placeholder=" ">
                        <label for="desenvolvimento_lideres">Desenvolvimento de Líderes</label>
                    </div>
                    <div class="col-md-3 form-floating">
                        <input type="number" readonly step="0.01" class="form-control" id="pesquisa_360" value="" name="pesquisa_360" required placeholder=" ">
                        <label for="pesquisa_360">Pesquisa 360 (NPS)</label>
                    </div>
                </div>

                <!-- Seção 3: Qualidade incontestável dos produtos e serviços (10%) 
                <h5 class="title-indicator my-3">3. Qualidade incontestável dos produtos e serviços (10%)</h5>

                <div class="row align-items-center mb-4">
                    <div class="col-md-12 form-floating">
                        <input type="number" step="0.01" class="form-control" id="nps_servico" value="4" name="nps_servico" required placeholder=" ">
                        <label for="nps_servico">NPS ligado a serviço</label>
                    </div>
                </div>

                <!-- Seção 4: Posicionamento e Branding (15%) 
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
                            <input type="file" style="display: none;" class="form-control" id="vitrines_tvs_padrao_imagem" name="vitrines_tvs_padrao_imagem">
                        </div>
                    </div>

                    <div class="col-md-3 form-floating">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="mimos_loja" name="mimos_loja" checked>
                            <label class="form-check-label" for="mimos_loja">Ter mimos disponíveis em loja</label>
                            <input type="file" style="display: none;" class="form-control" id="mimos_loja_imagem" name="mimos_loja_imagem">
                        </div>
                    </div>

                    <div class="col-md-3 form-floating">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="dress_code" name="dress_code" checked>
                            <label class="form-check-label" for="dress_code">Dress Code</label>
                            <input type="file" style="display: none;" class="form-control" id="dress_code_imagem" name="dress_code_imagem">
                        </div>
                    </div>

                    <!-- Seção 5: Indicadores de Resultado (35%) 
                    <h5 class="title-indicator my-3">5. Indicadores de Resultado (35%)</h5>

                    <div class="row align-items-center mb-4">
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="meta_batida" name="meta_batida" value="100" required placeholder="">
                            <label class="form-check-label" for="meta_batida">Meta mensal </label>
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


            </div>

            <div class="modal-footer">
                <button type="submit" class="btn btn-primary">Salvar Indicadores</button>
                </form>
            </div>
        </div>
    </div>
</div>
-->
<div class="modal fade" id="indicadoresModal" tabindex="-1" role="dialog" aria-labelledby="indicadoresModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="indicadoresModalLabel">Inserir Indicadores</h5>
                <button class="btn btn-close-modal" data-bs-dismiss="modal" aria-label="">
                    <i class="material-symbols-outlined">close</i>
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
                                <option value="Riomar">Riomar</option>
                                <option value="Jardins">Jardins</option>
                                <option value="Garcia">Garcia</option>
                                <option value="Treze">Treze</option>
                            </select>
                            <label for="loja">Loja</label>
                        </div>

                        <!-- Data picker -->
                        <div class="col-md-3 ">
                            <label for="periodo">Período da Avaliação</label>
                            <input type="text" class="form-control" name="periodo" id="periodo" required />
                        </div>


                        <!-- Mês da Avaliação (select) --
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
                        

                        <!-- ano da avaliação --
                        <div class="col-md-3 form-floating">
                            <input type="text" class="form-control" id="year" name="year" value="<?= date('Y'); ?>" readonly>
                            <label for="year">Ano</label>
                        </div>-->
                    </div>
                    <div class="indicator-selector">
                        <div class="row">
                            <div class="col-12">
                                <label class="col-12 mb-2">Selecione os Indicadores a Avaliar:</label>
                            </div>
                        </div>
                        <div class="row mb-4">
                            <div class="form-check form-check-inline col-auto">
                                <input class="form-check-input indicador-toggle" type="checkbox" id="ind1" value="1">
                                <label class="form-check-label" for="ind1">1. Ambiente Aconchegante</label>
                            </div>
                            <div class="form-check form-check-inline col-auto">
                                <input class="form-check-input indicador-toggle" type="checkbox" id="ind2" value="2">
                                <label class="form-check-label" for="ind2">2. Time de Especialistas</label>
                            </div>
                            <div class="form-check form-check-inline col-auto">
                                <input class="form-check-input indicador-toggle" type="checkbox" id="ind3" value="3">
                                <label class="form-check-label" for="ind3">3. Qualidade de Produtos/Serviços</label>
                            </div>
                            <div class="form-check form-check-inline col-auto">
                                <input class="form-check-input indicador-toggle" type="checkbox" id="ind4" value="4">
                                <label class="form-check-label" for="ind4">4. Posicionamento e Branding</label>
                            </div>
                            <div class="form-check form-check-inline col-auto">
                                <input class="form-check-input indicador-toggle" type="checkbox" id="ind5" value="5">
                                <label class="form-check-label" for="ind5">5. Indicadores de Resultado</label>
                            </div>
                        </div>
                    </div>


                    <!-- Seção 1: Ambiente Aconchegante (15%) -->
                    <div class="indicator-container indicator-1" data-indicator="1" style="display: none;">


                        <h5 class="title-indicator my-3">1. Ambiente Aconchegante (15%)</h5>

                        <div class="row align-items-center mb-4">
                            <div class="col-md-3 form-floating">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="reposicao_cafe" name="reposicao_cafe" checked>
                                    <label class="form-check-label" for="reposicao_cafe">Reposição de café</label>
                                    <input type="file" style="display: none;" class="form-control" id="reposicao_cafe_imagem" name="reposicao_cafe_imagem">
                                </div>
                            </div>

                            <div class="col-md-3 form-floating">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="bolo_bebidas_comidas" name="bolo_bebidas_comidas" checked>
                                    <label class="form-check-label" for="bolo_bebidas_comidas">Bolo / Bebidas / Comidas</label>
                                    <input type="file" style="display: none;" class="form-control" id="bolo_bebidas_comidas_imagem" name="bolo_bebidas_comidas_imagem">
                                </div>
                            </div>

                            <div class="col-md-3 form-floating">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="embalagens" name="embalagens" checked>
                                    <label class="form-check-label" for="embalagens">Embalagens certas</label>
                                    <input type="file" style="display: none;" class="form-control" id="embalagens_imagem" name="embalagens_imagem">
                                </div>
                            </div>

                            <div class="col-md-3 form-floating">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="mezanino" name="mezanino" checked>
                                    <label class="form-check-label" for="mezanino">Mezanino Organizado</label>
                                    <input type="file" style="display: none;" class="form-control" id="mezanino_imagem" name="mezanino_imagem">
                                </div>

                            </div>
                        </div>
                    </div>
                    <div class="indicator-container indicator-2" data-indicator="2" style="display: none;">
                        <!-- Seção 2: Time de Especialistas (25%) -->
                        <h5 class="title-indicator my-3">2. Time de Especialistas (25%)</h5>

                        <div class="row mb-3">
                            <!--<div class="col-md-3 form-floating">
                                <input type="number" step="0.01" class="form-control" id="taxa_equilibrio_time" value="30" name="taxa_equilibrio_time" placeholder=" " required>
                                <label for="taxa_equilibrio_time">Taxa de equilíbrio entre o time</label>
                            </div>-->
                            <div class="col-md-2 form-floating">
                                <input type="number" step="0.01" class="form-control" id="taxa_equilibrio_maior" name="taxa_equilibrio_maior" placeholder=" " required>
                                <label for="taxa_equilibrio_maior">Maior valor no período (R$)</label>
                            </div>
                            <div class="col-md-2 form-floating">
                                <input type="number" step="0.01" class="form-control" id="taxa_equilibrio_menor" name="taxa_equilibrio_menor" placeholder=" " required>
                                <label for="taxa_equilibrio_menor">Menor valor no período (R$)</label>
                            </div>


                            <div class="col-md-auto form-floating">
                                <input type="number" readonly step="0.01" class="form-control" id="nota_media_sti" value="" name="nota_media_sti" required placeholder=" ">
                                <label for="nota_media_sti">Média Provas S.T.I</label>
                            </div>
                            <div class="col-md-auto form-floating">
                                <input type="text" class="form-control" id="desenvolvimento_lideres" value="10" name="desenvolvimento_lideres" required placeholder=" ">
                                <label for="desenvolvimento_lideres">Desenvolvimento de Líderes</label>
                            </div>
                            <div class="col-md-auto form-floating">
                                <input type="number" readonly step="0.01" class="form-control" id="pesquisa_360" value="" name="pesquisa_360" required placeholder=" ">
                                <label for="pesquisa_360">Pesquisa 360 (NPS)</label>
                            </div>
                        </div>
                    </div>
                    <div class="indicator-container indicator-3" data-indicator="3" style="display: none;">
                        <!-- Seção 3: Qualidade incontestável dos produtos e serviços (10%) -->
                        <h5 class="title-indicator my-3">3. Qualidade incontestável dos produtos e serviços (10%)</h5>

                        <div class="row align-items-center mb-4">
                            <div class="col-md-12 form-floating">
                                <input type="number" step="0.01" class="form-control" id="nps_servico" value="4" name="nps_servico" required placeholder=" ">
                                <label for="nps_servico">NPS ligado a serviço</label>
                            </div>
                        </div>
                    </div>
                    <div class="indicator-container indicator-4" data-indicator="4" style="display: none;">
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
                                    <input type="file" style="display: none;" class="form-control" id="vitrines_tvs_padrao_imagem" name="vitrines_tvs_padrao_imagem">
                                </div>
                            </div>

                            <div class="col-md-3 form-floating">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="mimos_loja" name="mimos_loja" checked>
                                    <label class="form-check-label" for="mimos_loja">Ter mimos disponíveis em loja</label>
                                    <input type="file" style="display: none;" class="form-control" id="mimos_loja_imagem" name="mimos_loja_imagem">
                                </div>
                            </div>

                            <div class="col-md-3 form-floating">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="dress_code" name="dress_code" checked>
                                    <label class="form-check-label" for="dress_code">Dress Code</label>
                                    <input type="file" style="display: none;" class="form-control" id="dress_code_imagem" name="dress_code_imagem">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="indicator-container indicator-5" data-indicator="5" style="display: none;">
                        <!-- Seção 5: Indicadores de Resultado (35%) -->
                        <h5 class="title-indicator my-3">5. Indicadores de Resultado (35%)</h5>

                        <div class="row align-items-center mb-4">
                            <div class="col-md-3 form-floating">
                                <input type="text" class="form-control" id="meta_batida" name="meta_batida" value="100" required placeholder="">
                                <label class="form-check-label" for="meta_batida">Meta mensal </label>
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
            </div>




            <div class="modal-footer">
                <button type="submit" class="btn btn-primary">Salvar Indicadores</button>
                </form>
            </div>

        </div>
    </div>
</div>

<script>
    document.addEventListener("DOMContentLoaded", function() {
        const checkboxes = document.querySelectorAll(".indicador-toggle");
        const form = document.getElementById("indicadoresForm");
        let selectedInput = document.getElementById("indicadores_avaliados");

        if (!selectedInput) {
            selectedInput = document.createElement("input");
            selectedInput.type = "hidden";
            selectedInput.name = "indicadores_avaliados";
            selectedInput.id = "indicadores_avaliados";
            form.appendChild(selectedInput);
        }

        function updateSelectedIndicators() {
            const selected = Array.from(checkboxes)
                .filter(c => c.checked)
                .map(c => c.value);

            selectedInput.value = selected.join(",");

            document.querySelectorAll(".indicator-container").forEach(container => {
                const id = container.dataset.indicator;
                const isSelected = selected.includes(id);
                container.style.display = isSelected ? "block" : "none";

                // Desativa campos não exibidos
                container.querySelectorAll("input, select, textarea").forEach(input => {
                    input.disabled = !isSelected;
                });
            });
        }

        checkboxes.forEach(checkbox => checkbox.addEventListener("change", updateSelectedIndicators));
        updateSelectedIndicators(); // Executa inicialmente
    });
</script>