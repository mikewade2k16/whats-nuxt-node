<?php
ob_clean();
header('Content-Type: application/json');
echo json_encode($dashboard, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
exit;


ini_set('display_errors', 1);
error_reporting(E_ALL);

/* ------------------------------------------------------------------ */
/* Coleta de indicadores                                              */
/* ------------------------------------------------------------------ */
$indicadores = [
    1 => obterDadosIndicador1($startDate, $endDate, $conn),
    2 => obterDadosIndicador2($startDate, $endDate, $conn),
    3 => obterDadosIndicador3($startDate, $endDate, $conn),
    4 => obterDadosIndicador4($startDate, $endDate, $conn),
    5 => obterDadosIndicador5($startDate, $endDate, $conn),
];

/* Estrutura base */
$dashboard = [
    'periodo' => ['start' => $startDate, 'end' => $endDate],
    'lojas'   => [],
    'medias_indicadores' => [],      // valor bruto (0–peso)
];

foreach ($lojas as $loja) {
    $dashboard['lojas'][$loja] = [
        'peso_utilizado'   => 0,     // soma dos pesos avaliados
        'nota_total'       => 0,     // soma bruta (já ponderada por classe)
        'media_ponderada'  => null,  // 0–100 (calculada ao final)
        'faltando'         => [],
        'notas_indicadores' => [],    // valor bruto (0–peso)
    ];
}

/* Matriz loja × indicador */
foreach ($indicadores as $idx => $ind) {
    $peso = $ind['peso_classe'];
    $soma = 0;
    $cont = 0;

    foreach ($lojas as $loja) {
        $media = $ind['lojas'][$loja]['media_final'] ?? 0;
        //  $media = $ind['lojas'][$loja]['media_ponderada'] ?? 0;


        if ($media == 0) {
            $dashboard['lojas'][$loja]['faltando'][] = $idx;
            continue;
        }

        $dashboard['lojas'][$loja]['notas_indicadores'][$idx] = $media;
        $dashboard['lojas'][$loja]['nota_total'] += $media;
        $dashboard['lojas'][$loja]['peso_utilizado'] += $peso;

        $soma += $media;
        $cont++;
    }

    $dashboard['medias_indicadores'][$idx] = $cont ? round($soma / $cont, 2) : null;
}

/* Média ponderada por loja – agora convertendo para 0–100 apenas para ranking */
foreach ($lojas as $loja) {
    $peso = $dashboard['lojas'][$loja]['peso_utilizado'];
    $nota = $dashboard['lojas'][$loja]['nota_total'];
    $dashboard['lojas'][$loja]['media_ponderada'] = $peso ? round(($nota / $peso) * 100, 2) : null;
}

/* Ranking */
$ranking = $dashboard['lojas'];
uasort($ranking, function ($a, $b) {
    return ($b['media_ponderada'] ?? 0) <=> ($a['media_ponderada'] ?? 0);
});
$dashboard['resumo'] = [
    'ranking_lojas' => array_keys($ranking),
    'melhor_loja'  => key($ranking),
    'pior_loja'    => array_key_last($ranking),
];

/* ------------------------------------------------------------------
 * Debug opcional
 * ------------------------------------------------------------------*/
//if (isset($_GET['debug'])) {
//echo '<pre>', print_r($dashboard, true), '</pre>';
//}


?>

<div class="row">
    <div class="col-md-12">
        <table border="1" cellpadding="8" cellspacing="0">
            <thead>
                <tr>
                    <th>Loja</th>
                    <th>Indicador 1</th>
                    <th>Indicador 2</th>
                    <th>Indicador 3</th>
                    <th>Indicador 4</th>
                    <th>Indicador 5</th>
                    <th>Média Geral</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($dashboard['lojas'] as $loja => $dados): ?>
                    <tr>
                        <td><strong><?= $loja ?></strong></td>

                        <?php for ($i = 1; $i <= 5; $i++): ?>
                            <td>
                                <?= isset($dados['notas_indicadores'][$i])
                                    ? number_format($dados['notas_indicadores'][$i], 2)
                                    : '<span style="color:red;">–</span>' ?>
                            </td>
                        <?php endfor; ?>

                        <td><strong><?= $dados['media_ponderada'] !== null ? number_format($dados['media_ponderada'], 2) : '–' ?></strong></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

    </div>
</div>