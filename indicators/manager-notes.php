<?php

function obterResultadosPorCategoria($conn, $loja, $categoria)
{
    $resultados = [];

    // Definir quais categorias são da Gerência e quais são da Diretoria
    $indicadoresGerencia = [
        'satisfaction' => 'Satisfação',
        'team_climate' => 'Clima de Equipe',
        'leader' => 'Liderança',
        'procedures' => 'Procedimentos',
        'tools' => 'Ferramentas',
        'growth_opportunities' => 'Oportunidades de Crescimento',
        'recognition' => 'Valorização',
        'challenges' => 'Desafios'
    ];

    $indicadoresDiretoria = [
        'dept_communication' => 'Comunicação Departamentos',
        'management' => 'Diretoria',
        'store_communication' => 'Comunicação Lojas',
        'benefits' => 'Benefícios'
    ];

    $indicadoresSelecionados = $categoria == 'Gerência' ? $indicadoresGerencia : $indicadoresDiretoria;

    $query = "
        SELECT 
            " . implode(", ", array_keys($indicadoresSelecionados)) . " 
        FROM collab_satisfaction
        WHERE store = '$loja'
    ";

    $result = $conn->query($query);

    if ($result && $row = $result->fetch_assoc()) {
        foreach ($indicadoresSelecionados as $key => $label) {
            // Extrair a nota do JSON e converter para float
            $jsonData = json_decode($row[$key], true);
            $nota = isset($jsonData['nota']) ? (float) $jsonData['nota'] : 0;

            // Armazenar a nota formatada
            $resultados[$label] = number_format($nota, 1);
        }
    }

    return $resultados;
}

$satisfacaoGerenciaRiomar = obterResultadosPorCategoria($conn, 'Riomar', 'Gerência');
$satisfacaoDiretoriaRiomar = obterResultadosPorCategoria($conn, 'Riomar', 'Diretoria');

$satisfacaoGerenciaJardins = obterResultadosPorCategoria($conn, 'Jardins', 'Gerência');
$satisfacaoDiretoriaJardins = obterResultadosPorCategoria($conn, 'Jardins', 'Diretoria');

$satisfacaoGerenciaGarcia = obterResultadosPorCategoria($conn, 'Garcia', 'Gerência');  // Corrigido
$satisfacaoDiretoriaGarcia = obterResultadosPorCategoria($conn, 'Garcia', 'Diretoria');  // Corrigido

$satisfacaoGerenciaTreze = obterResultadosPorCategoria($conn, 'Treze', 'Gerência');  // Corrigido
$satisfacaoDiretoriaTreze = obterResultadosPorCategoria($conn, 'Treze', 'Diretoria');  // Corrigido

// Função para calcular a média
function calcularMediaCategoria($resultados)
{
    if (!is_array($resultados) || count($resultados) == 0) {
        return 0;  // Retorna 0 se $resultados não for um array ou estiver vazio
    }

    $soma = array_sum($resultados);
    $media = $soma / count($resultados);

    return number_format($media, 1);
}

// Agora podemos calcular as médias sem erros
$mediaGerenciaRiomar = calcularMediaCategoria($satisfacaoGerenciaRiomar);
$mediaDiretoriaRiomar = calcularMediaCategoria($satisfacaoDiretoriaRiomar);

$mediaGerenciaJardins = calcularMediaCategoria($satisfacaoGerenciaJardins);
$mediaDiretoriaJardins = calcularMediaCategoria($satisfacaoDiretoriaJardins);

$mediaGerenciaGarcia = calcularMediaCategoria($satisfacaoGerenciaGarcia);
$mediaDiretoriaGarcia = calcularMediaCategoria($satisfacaoDiretoriaGarcia);

$mediaGerenciaTreze = calcularMediaCategoria($satisfacaoGerenciaTreze);
$mediaDiretoriaTreze = calcularMediaCategoria($satisfacaoDiretoriaTreze);

