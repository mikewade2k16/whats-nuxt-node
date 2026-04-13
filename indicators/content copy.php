<?php
include 'app/views/admin/pages/functions/base.php';
include 'app/views/admin/pages/functions/indicatorOne.php';
include 'app/views/admin/pages/functions/indicatorTwo.php';
//include 'app/views/admin/pages/functions/_indicatorThree.php';
include 'app/views/admin/pages/functions/indicatorThree.php';
include 'app/views/admin/pages/functions/indicatorFour.php';
//include 'app/views/admin/pages/functions/_indicatorFour.php';
include 'app/views/admin/pages/functions/indicatorFive.php';



// Se não houver valores na URL, usa os padrões (mês e ano atuais)
$mes = isset($_GET['mes']) ? intval($_GET['mes']) : 1;  // Janeiro como padrão
$ano = isset($_GET['ano']) ? intval($_GET['ano']) : date('Y'); // Ano atual como padrão

//novo modo de filtragem
$startDate = $_GET['start_date'] ?? date('Y-m-01');
$endDate = $_GET['end_date'] ?? date('Y-m-t');

//Indicador 1
$dadosIndicador1 = obterDadosIndicador1($startDate, $endDate, $conn);
$pesoClasseOne = $dadosIndicador1['peso_classe'];
$dadosIndicador1Lojas = $dadosIndicador1['lojas'];

//indicador 2
$dadosIndicador2 = obterDadosIndicador2($startDate, $endDate, $conn);
$lojas           = array_keys($dadosIndicador2['lojas']);

// Indicador 3 - Qualidade de Produtos e Serviços
$dadosIndicador3 = obterDadosIndicador3($startDate, $endDate, $conn);
$lojas = array_keys($dadosIndicador3['lojas']);


//indicador 4
$dadosIndicador4 = obterDadosIndicador4($startDate, $endDate, $conn);

//indicador 5
$dadosIndicador5 = obterDadosIndicador5($startDate, $endDate, $conn);

$dataFormatadaInicio = date('d/m/Y', strtotime($startDate));
$dataFormatadaFim = date('d/m/Y', strtotime($endDate));
?>
<h4 class="text-center">
    Exibindo dados de: <?= formatarDataComMesAbreviado($dataFormatadaInicio) ?> até <?= formatarDataComMesAbreviado($dataFormatadaFim) ?>
</h4>

<div class="row justify-content-end align-items-center gap-2">
    <div class="col-md-auto">
        <button class="btn btn-link btn-indicadores " type="button" data-bs-toggle="collapse" data-bs-target="#collapseIndicadores" aria-expanded="false" aria-controls="collapseIndicadores">
            Indicadores Cadastrados
            <span class="material-symbols-outlined">
                keyboard_arrow_down
            </span>
        </button>

    </div>
    <div class="col-md-auto">
        <form method="GET" class="row g-2 align-items-center">
            <div class="col-md-auto">
                <input type="text" name="range" class="form-control" id="rangePicker" />
            </div>
            <div class="col-md-auto">
                <button type="submit" id="aplyFilter" class="btn btn-primary btn-filter">Aplicar</button>
            </div>
        </form>

    </div>
    <div class="col-md-auto">
        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#indicadoresModal">
            Avaliar
        </button>
    </div>
</div>

<?php
// Verifica se há avaliações para o mês e ano selecionados
$sql = "SELECT COUNT(*) as total FROM avaliacoes WHERE NOT (end_date < ? OR start_date > ?)";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ss", $startDate, $endDate);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();
$totalAvaliacoes = $row['total'];

?>

<script>
    document.addEventListener("DOMContentLoaded", function() {
        // Configurações
        /*
        const anoInicial = 2024; // Define o primeiro ano permitido
        const bloquearFuturo = true; // Bloquear pesquisa para anos futuros?
        const bloquearMesesFuturos = true; // Bloquear meses futuros no ano atual?

        // Elementos do DOM
        const selectMes = document.getElementById("mes");
        const selectAno = document.getElementById("ano");
        const tituloPeriodo = document.getElementById("tituloPeriodo");

        // Obtém parâmetros da URL para manter os valores selecionados
        const urlParams = new URLSearchParams(window.location.search);
        let mesSelecionado = urlParams.has("mes") ? parseInt(urlParams.get("mes")) : null;
        let anoSelecionado = urlParams.has("ano") ? parseInt(urlParams.get("ano")) : null;

        // Obtém a data atual
        const dataAtual = new Date();
        const mesAtual = dataAtual.getMonth() + 1; // getMonth() retorna 0-11, então somamos 1
        const anoAtual = dataAtual.getFullYear();

        // Se não há valores na URL, usa os valores atuais
        if (!mesSelecionado) mesSelecionado = mesAtual;
        if (!anoSelecionado) anoSelecionado = anoAtual;

        // Função para atualizar a lista de meses dinamicamente
        function atualizarMeses() {
            const anoSelecionadoAgora = parseInt(selectAno.value);

            // Limpa o select de meses antes de preencher
            selectMes.innerHTML = "";

            for (let i = 1; i <= 12; i++) {
                // Se bloquear meses futuros e o ano selecionado for o atual, limita os meses
                if (bloquearMesesFuturos && anoSelecionadoAgora === anoAtual && i > mesAtual) {
                    break;
                }

                const nomeMes = new Intl.DateTimeFormat("pt-BR", {
                    month: "long"
                }).format(new Date(2022, i - 1, 1));
                const option = document.createElement("option");
                option.value = i;
                option.textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1); // Primeira letra maiúscula
                option.selected = i === mesSelecionado; // Mantém o mês da URL ou o mês atual
                selectMes.appendChild(option);
            }
        }

        // Função para atualizar a lista de anos dinamicamente
       
        function atualizarAnos() {
            // Limpa o select de anos antes de preencher
            selectAno.innerHTML = "";

            for (let ano = anoInicial; ano <= (bloquearFuturo ? anoAtual : anoAtual + 5); ano++) {
                const option = document.createElement("option");
                option.value = ano;
                option.textContent = ano;
                option.selected = ano === anoSelecionado; // Mantém o ano da URL ou o ano atual
                selectAno.appendChild(option);
            }
        }

        // Atualiza o título apenas se há parâmetros na URL
        function atualizarTituloPeriodo() {
            if (urlParams.has("mes") && urlParams.has("ano")) {
                const nomeMes = new Intl.DateTimeFormat("pt-BR", {
                    month: "long"
                }).format(new Date(2022, mesSelecionado - 1, 1));
                tituloPeriodo.textContent = `Exibindo dados de: ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} de ${anoSelecionado}`;
            } else {
                tituloPeriodo.textContent = "";
            }
        }

        // Atualiza os selects ao carregar a página
        atualizarAnos();
        atualizarMeses(); 
        atualizarTituloPeriodo();

        // Atualiza os meses e título quando o usuário muda o ano
        selectAno.addEventListener("change", function() {
            atualizarMeses();
            anoSelecionado = parseInt(selectAno.value);
            //  atualizarTituloPeriodo();
        });

        // Atualiza o título quando o usuário muda o mês
        selectMes.addEventListener("change", function() {
            mesSelecionado = parseInt(selectMes.value);
            //atualizarTituloPeriodo();
        });*/
    });
</script>

<?php
// Query para buscar os dados das avaliações
$sql = "SELECT id, avaliador, loja, start_date, end_date, indicadores_avaliados FROM avaliacoes";

$result = $conn->query($sql);

include 'app/views/admin/pages/functions/avaliations.php';

$nomesIndicadores = [
    1 => '1. Ambiente Aconchegante',
    2 => '2. Time de Especialistas',
    3 => '3. Qualidade dos Produtos e Serviços',
    4 => '4. Posicionamento e Branding',
    5 => '5. Indicadores de Resultado'
];
?>


<div class="row">
    <div class="col-md-12">
        <!-- Botão para abrir/fechar a tabela -->

        <!-- Container da Tabela com Collapse -->
        <div class="collapse " id="collapseIndicadores">

            <table id="avaliacoesTable" class="responsive table" style="width:100%">
                <thead>
                    <tr>
                        <!-- <th>ID</th> -->
                        <th>Avaliador</th>
                        <th>Loja</th>
                        <th>Indicadores</th>
                        <th>Período Inicio</th>
                        <th>Período Fim</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <?php while ($row = $result->fetch_assoc()) : ?>
                        <tr>
                            <!-- <td><?= $row['id'] ?></td> -->
                            <td><?= $row['avaliador'] ?></td>
                            <td><?= $row['loja'] ?></td>
                            <?php
                            $badges = '';
                            if (!empty($row['indicadores_avaliados'])) {
                                $ids = explode(',', $row['indicadores_avaliados']);
                                foreach ($ids as $id) {
                                    $id = trim($id);
                                    if (isset($nomesIndicadores[$id])) {
                                        $badges .= '<span class="badge bg-primary w-auto">' . $nomesIndicadores[$id] . '</span>';
                                    }
                                }
                            }
                            ?>
                            <td>
                                <div class="d-flex justify-content-center align-items-start gap-2">
                                    <?= $badges ?: '<span class="text-muted">Nenhum</span>' ?>
                                </div>
                            </td>

                            <td><?= formatarDataComMesAbreviado(date('d/m/Y', strtotime($row['start_date']))) ?></td>
                            <td><?= formatarDataComMesAbreviado(date('d/m/Y', strtotime($row['end_date']))) ?></td>

                            <td class="row-table">
                                <div class="td-options">
                                    <button class="btn btn-icon btn-danger btn-delete" data-id="<?= $row['id'] ?>"><i class='material-symbols-outlined'>delete</i></button>
                                </div>
                            </td>
                        </tr>
                    <?php endwhile; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php


// Se houver avaliações, exibe os indicadores
if ($totalAvaliacoes > 0) :
?>
    <div class="row indicators mt-5">
        <?php
        $lojas = ['Riomar', 'Jardins', 'Garcia', 'Treze'];

        include 'app/views/admin/pages/indicators/dashboard.php';
        ?>
        <div class="row mb-4 mt-5">
            <div class="col-md-12">
                <h4>Indicadores</h4>
            </div>
        </div>
        
        <?php
        include 'indicator-1.php';
        include 'indicator-2.php';
        include 'indicator-3.php';
        include 'indicator-4.php';
        include 'indicator-5.php';
        include 'app/views/admin/pages/functions/graphicScripts.php';
        ?>
    </div>
<?php else : ?>
    <p class="mt-5 text-center text-muted">Nenhuma avaliação encontrada para este período.</p>
<?php endif; ?>


<?php
include 'app/views/admin/pages/indicators/modal-avaliations.php';
?>


<script>
    document.getElementById('loja').addEventListener('change', function() {
        // Obtenha o valor da loja selecionada
        var lojaSelecionada = this.value;

        // Defina as variáveis do PHP no JavaScript para Pesquisa 360 (NPS)
        var mediaRiomar = <?php echo json_encode(isset($satisfacaoGeralRiomar) ? $satisfacaoGeralRiomar : null); ?>;
        var mediaJardins = <?php echo json_encode(isset($satisfacaoGeralJardins) ? $satisfacaoGeralJardins : null); ?>;
        var mediaGarcia = <?php echo json_encode(isset($satisfacaoGeralGarcia) ? $satisfacaoGeralGarcia : null); ?>;
        var mediaTreze = <?php echo json_encode(isset($satisfacaoGeralTreze) ? $satisfacaoGeralTreze : null); ?>;

        // Defina as variáveis do PHP no JavaScript para Média Provas S.T.I
        var stiRiomar = <?php echo json_encode(isset($notaSTIRiomar) ? number_format($notaSTIRiomar, 2) : null); ?>;
        var stiJardins = <?php echo json_encode(isset($notaSTIJardins) ? number_format($notaSTIJardins, 1) : null); ?>;
        var stiGarcia = <?php echo json_encode(isset($notaSTIGarcia) ? number_format($notaSTIGarcia, 1) : null); ?>;
        var stiTreze = <?php echo json_encode(isset($notaSTITreze) ? number_format($notaSTITreze, 1) : null); ?>;


        // Determine qual valor usar com base na loja selecionada para Pesquisa 360 (NPS)
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

        // Determine qual valor usar com base na loja selecionada para Média Provas S.T.I
        var stiSelecionada;
        switch (lojaSelecionada) {
            case 'Riomar':
                stiSelecionada = stiRiomar;
                break;
            case 'Jardins':
                stiSelecionada = stiJardins;
                break;
            case 'Garcia':
                stiSelecionada = stiGarcia;
                break;
            case 'Treze':
                stiSelecionada = stiTreze;
                break;
            default:
                stiSelecionada = '';
                break;
        }

        // Atualize os campos "Pesquisa 360 (NPS)" e "Média Provas S.T.I" com os valores selecionados
        document.getElementById('pesquisa_360').value = mediaSelecionada;
        document.getElementById('nota_media_sti').value = stiSelecionada;
    });

    // Preenche o ano automaticamente
    // var currentYear = new Date().getFullYear();
    // document.getElementById('year').value = currentYear;
</script>

<!-- Chocolat LIghtbox -->
<script>
    document.addEventListener("DOMContentLoaded", function(event) {
        const chocolatInstance = Chocolat(document.querySelectorAll('.chocolat-image'), {
            imageSize: 'contain',
            closeOnBackgroundClick: true,
            enableZoom: false,
            fullScreen: false,
            loop: false,
            enableZoom: true,

        });


    });
</script>

<!-- -->
<script>
    $(document).ready(function() {
        $('#indicadoresForm').on('submit', function(event) {
            event.preventDefault(); // Impede o envio padrão do formulário

            var formData = new FormData(this);

            for (var pair of formData.entries()) {
                if (pair[1] instanceof File) {
                    console.log(pair[0] + ': ' + pair[1].name + ' (Arquivo)'); // Exibe o nome do arquivo
                } else {
                    console.log(pair[0] + ': ' + pair[1]); // Exibe os outros campos
                }
            }

            // Enviar o formulário via AJAX
            $.ajax({
                url: '../back/admin/indicadores.php',
                type: 'POST',
                data: formData,
                contentType: false,
                processData: false,
                success: function(response) {
                    // Exibir o SweetAlert como um toast no canto superior direito
                    $('#indicadoresModal').modal('hide');
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: response,
                        showConfirmButton: true,
                        // timer: 2000 // 2 segundos
                    }).then(() => {

                        // Fecha o modal após a exibição do alerta
                        $('#indicadoresForm')[0].reset(); // Limpar o formulário

                        // Ocultar todos os campos de upload de imagem
                        $('input[type="file"]').each(function() {
                            // $(this).closest('.col-md-3').hide(); // Ocultar o container do input de imagem
                        });
                        // Desmarca todos os checkboxes de indicadores
                        document.querySelectorAll('.indicador-toggle').forEach(cb => {
                            cb.checked = false;
                        });

                        // Força o update visual
                        const event = new Event('change');
                        document.querySelector('.indicador-toggle').dispatchEvent(event);
                    });
                },
                error: function(xhr, status, error) {
                    // Exibir o SweetAlert em caso de erro, também como toast
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'error',
                        title: 'Erro ao enviar os dados',
                        text: error,
                        showConfirmButton: true,
                        // timer: 1000 // 1 segundo
                    });
                }
            });
        });


    });
</script>

<!-- Tabela de avaliações -->
<script>
    $(document).ready(function() {
        new DataTable('#avaliacoesTable', {
            dom: 'Blfrtip',
            buttons: [{
                    extend: 'excel',
                    text: 'Exportar para Excel',
                    exportOptions: {
                        columns: [0, 1, 2, 3, 4, 5, 6]
                    }
                },
                {
                    extend: 'pdf',
                    text: 'Exportar para PDF',
                    exportOptions: {
                        columns: [0, 1, 2, 3, 4, 5, 6]
                    }
                }
            ],
            order: [
                [0, 'desc']
            ],
            language: {
                url: 'plugins/datatable/pt-br.json',
                lengthMenu: 'Resultados por página _MENU_ ',
                responsive: true,
                columnDefs: [{
                        responsivePriority: 1,
                        targets: 0
                    },
                    {
                        responsivePriority: 2,
                        targets: -1
                    },
                    {
                        responsivePriority: 3,
                        targets: -2
                    }
                ]
            },
            lengthMenu: [
                [10, 15, 20, -1],
                ['Mostrar 10', 'Mostrar 15', 'Mostrar 20', 'Mostrar Todos']
            ],
            pageLength: 10
        });



        // Evento de clique para excluir
        $('.btn-delete').on('click', function() {
            var id = $(this).data('id');

            // Exibir o SweetAlert com confirmação
            Swal.fire({
                title: 'Tem certeza que deseja excluir esta avaliação?',
                text: "Esta ação não pode ser desfeita!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sim, excluir!',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Se o usuário confirmar, executa o AJAX para exclusão
                    $.ajax({
                        url: '../back/admin/delete-avaliacao.php', // Página PHP para processar a exclusão
                        type: 'POST',
                        data: {
                            id: id
                        },
                        success: function(response) {
                            Swal.fire({
                                toast: true,
                                position: 'top-end',
                                icon: 'success',
                                title: 'Excluído!',
                                text: response,
                                showConfirmButton: false,
                                timer: 2000 // 2 segundos
                            }).then(() => {
                                // location.reload(); // Recarregar a página após a exclusão
                                console.log("Excluido");

                            });
                        },
                        error: function(xhr, status, error) {
                            Swal.fire({
                                icon: 'error',
                                title: 'Erro!',
                                text: 'Erro ao excluir: ' + error,
                                showConfirmButton: false,
                                timer: 3000 // 3 segundos
                            });
                        }
                    });
                }
            });
        });

    });
</script>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        // Selecionar todos os checkboxes e todos os campos de imagem
        const checkboxes = document.querySelectorAll('.form-check-input');

        checkboxes.forEach(function(checkbox) {
            // Obter o campo de imagem correspondente com base no ID do checkbox
            const imageFieldId = checkbox.id + '_imagem';
            const imageField = document.getElementById(imageFieldId);

            // Adicionar um listener de 'change' a cada checkbox
            checkbox.addEventListener('change', function() {
                if (checkbox.checked) {
                    console.log(`Campo ${checkbox.id} está marcado`);
                    // Ocultar o campo de imagem e remover o atributo 'required', caso tenha
                    if (imageField) {
                        imageField.style.display = 'none';
                        imageField.removeAttribute('required');
                    }
                } else {
                    console.log(`Campo ${checkbox.id} está desmarcado`);
                    // Mostrar o campo de imagem e adicionar o atributo 'required', caso não tenha
                    if (imageField) {
                        imageField.style.display = 'block';
                        if (!imageField.hasAttribute('required')) {
                            imageField.setAttribute('required', 'required');
                        }
                    }
                }
            });
        });
    });
</script>

<!-- Avaliação de indicador  datapicker --
<script>
    $('#periodo').daterangepicker({
        locale: {
            format: 'DD/MM/YYYY',
            applyLabel: 'Aplicar',
            cancelLabel: 'Cancelar',
            daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
            monthNames: [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ],
            firstDay: 0
        },
        startDate: moment().startOf('month'),
        endDate: moment().endOf('month'),
        alwaysShowCalendars: true,
        opens: 'right',
        showDropdowns: true,
        minYear: 2023,
        ranges: {
            'Hoje': [moment(), moment()],
            'Ontem': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
            'Essa semana': [moment().startOf('week'), moment().endOf('week')],
            'Últimos 30 dias': [moment().subtract(29, 'days'), moment()],
            'Mês passado': [
                moment().subtract(1, 'month').startOf('month'),
                moment().subtract(1, 'month').endOf('month')
            ],
            'Esse mês': [moment().startOf('month'), moment().endOf('month')],
            'Últimos 3 meses': [moment().subtract(3, 'months'), moment()],
            'Últimos 6 meses': [moment().subtract(6, 'months'), moment()],
            'Último ano': [moment().subtract(1, 'year'), moment()]
        }
    });
</script>


<!-- Script filtro range date --
<script>
    let dataInicioSelecionada = null;
    let dataFimSelecionada = null;

    $(function() {
        $('#rangePicker').daterangepicker({
            locale: {
                format: 'DD/MM/YYYY',
                applyLabel: 'Aplicar',
                cancelLabel: 'Cancelar',
                daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
                monthNames: [
                    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                ],
                firstDay: 0
            },
            startDate: moment().startOf('month'),
            endDate: moment().endOf('month'),
            alwaysShowCalendars: true,
            opens: 'right',
            showDropdowns: true,
            minYear: 2023,
            ranges: {
                'Hoje': [moment(), moment()],
                'Ontem': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                'Essa semana': [moment().startOf('week'), moment().endOf('week')],
                'Últimos 30 dias': [moment().subtract(29, 'days'), moment()],
                'Esse mês': [moment().startOf('month'), moment().endOf('month')],
                'Últimos 3 meses': [moment().subtract(3, 'months'), moment()],
                'Últimos 6 meses': [moment().subtract(6, 'months'), moment()],
                'Último ano': [moment().subtract(1, 'year'), moment()]
            }
        }, function(start, end) {
            // Callback quando uma data é selecionada
            dataInicioSelecionada = start.format('YYYY-MM-DD');
            dataFimSelecionada = end.format('YYYY-MM-DD');

            console.log('[DATERANGEPICKER] Datas selecionadas:');
            console.log('Início:', dataInicioSelecionada);
            console.log('Fim:', dataFimSelecionada);
        });

        // Quando o botão "Aplicar" fora do daterangepicker for clicado
        $('#aplyFilter').on('click', function(e) {
            e.preventDefault();

            if (!dataInicioSelecionada || !dataFimSelecionada) {
                // Se o usuário não mexeu no picker, pegamos o valor atual
                const valor = $('#rangePicker').val();
                const partes = valor.split(' - ');
                if (partes.length === 2) {
                    dataInicioSelecionada = moment(partes[0], 'DD/MM/YYYY').format('YYYY-MM-DD');
                    dataFimSelecionada = moment(partes[1], 'DD/MM/YYYY').format('YYYY-MM-DD');
                }
            }

            console.log('[BOTÃO APLICAR] Enviar para backend:');
            console.log('Data Início:', dataInicioSelecionada);
            console.log('Data Fim:', dataFimSelecionada);

            // Próximo passo: enviar via AJAX quando for autorizado
            // Redireciona com os parâmetros via GET
            const novaUrl = `?start_date=${dataInicioSelecionada}&end_date=${dataFimSelecionada}`;
            window.location.href = novaUrl;
        });
    });
</script>
-->
<script>
    // Função utilitária para pegar parâmetros da URL
    function getUrlParameter(name) {
        name = name.replace(/[[]/, '\\[').replace(/[\]]/, '\\]');
        const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
        const results = regex.exec(window.location.search);
        return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
    }

    // Pega os parâmetros reais
    const urlStart = getUrlParameter('start_date');
    const urlEnd = getUrlParameter('end_date');

    // Usa os valores da URL se existirem, senão o mês atual
    const initialStart = urlStart ? moment(urlStart, 'YYYY-MM-DD') : moment().startOf('month');
    const initialEnd = urlEnd ? moment(urlEnd, 'YYYY-MM-DD') : moment().endOf('month');

    const configDaterangepicker = {
        locale: {
            format: 'DD/MM/YYYY',
            applyLabel: 'Aplicar',
            cancelLabel: 'Cancelar',
            daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
            monthNames: [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ],
            firstDay: 0
        },
        startDate: initialStart,
        endDate: initialEnd,

        alwaysShowCalendars: true,
        opens: 'right',
        showDropdowns: true,
        minYear: 2023,
        ranges: {
            'Hoje': [moment(), moment()],
            'Ontem': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
            'Essa semana': [moment().startOf('week'), moment().endOf('week')],
            'Últimos 30 dias': [moment().subtract(29, 'days'), moment()],
            'Mês passado': [
                moment().subtract(1, 'month').startOf('month'),
                moment().subtract(1, 'month').endOf('month')
            ],
            'Esse mês': [moment().startOf('month'), moment().endOf('month')],
            'Últimos 3 meses': [moment().subtract(3, 'months'), moment()],
            'Últimos 6 meses': [moment().subtract(6, 'months'), moment()],
            'Último ano': [moment().subtract(1, 'year'), moment()]
        }
    };

    let dataInicioSelecionada = null;
    let dataFimSelecionada = null;

    $(function() {
        // Inicializa #periodo (sem callback)
        if ($('#periodo').length) {
            $('#periodo').daterangepicker(configDaterangepicker);
        }

        // Inicializa #rangePicker (com callback e envio)
        if ($('#rangePicker').length) {
            $('#rangePicker').daterangepicker(configDaterangepicker);

            // Ao aplicar datas dentro do rangePicker, já executa o filtro automaticamente
            $('#rangePicker').on('apply.daterangepicker', function(ev, picker) {
                dataInicioSelecionada = picker.startDate.format('YYYY-MM-DD');
                dataFimSelecionada = picker.endDate.format('YYYY-MM-DD');

                console.log('[APLICAR DIRETO] Datas selecionadas:');
                console.log('Início:', dataInicioSelecionada);
                console.log('Fim:', dataFimSelecionada);

                const novaUrl = `?start_date=${dataInicioSelecionada}&end_date=${dataFimSelecionada}`;
                window.location.href = novaUrl;
            });

            $('#aplyFilter').on('click', function(e) {
                e.preventDefault();

                if (!dataInicioSelecionada || !dataFimSelecionada) {
                    const valor = $('#rangePicker').val();
                    const partes = valor.split(' - ');
                    if (partes.length === 2) {
                        dataInicioSelecionada = moment(partes[0], 'DD/MM/YYYY').format('YYYY-MM-DD');
                        dataFimSelecionada = moment(partes[1], 'DD/MM/YYYY').format('YYYY-MM-DD');
                    }
                }

                console.log('[BOTÃO APLICAR] Enviar para backend:');
                console.log('Data Início:', dataInicioSelecionada);
                console.log('Data Fim:', dataFimSelecionada);

                const novaUrl = `?start_date=${dataInicioSelecionada}&end_date=${dataFimSelecionada}`;
                window.location.href = novaUrl;
            });
        }
    });
</script>


<script>
    document.addEventListener('DOMContentLoaded', function() {
        const picker = document.getElementById('rangePicker');
        const urlParams = new URLSearchParams(window.location.search);
        const start = urlParams.get('start_date');
        const end = urlParams.get('end_date');

        if (start && end) {
            const inicio = moment(start, 'YYYY-MM-DD').format('DD/MM/YYYY');
            const fim = moment(end, 'YYYY-MM-DD').format('DD/MM/YYYY');
            picker.value = `${inicio} - ${fim}`;
        }
    });
</script>