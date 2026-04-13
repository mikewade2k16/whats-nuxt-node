<?php
/* ------------------------------------------------------------------ */
/* Coleta de indicadores                                              */
/* ------------------------------------------------------------------ */
require_once 'app/controllers/DashboardIndicatoresController.php';

// 1) Obter dashboard (usa cache em sessão)
// 1) Dashboard completo
$dash = DashboardIndicatoresController::getDashboard($startDate, $endDate, $conn);

// 2) Funções principais
$melhorLoja       = DashboardIndicatoresController::calcularMelhorLoja($dash);
$piorLoja         = DashboardIndicatoresController::calcularPiorLoja($dash);
$melhorIndicador  = DashboardIndicatoresController::calcularMelhorIndicador($dash);
$piorIndicador    = DashboardIndicatoresController::calcularPiorIndicador($dash);
//$mediaGeral       = DashboardIndicatoresController::calcularMediaGeral($dash);
/* não exitem mais por enquanto
$gargalosTop3     = DashboardIndicatoresController::calcularTopGargalos($dash, 3);

// 3) Funções extras
$naoAvaliadosRiomar = DashboardIndicatoresController::indicadoresNaoAvaliados($dash, 'Riomar');
$evolucaoRiomar     = DashboardIndicatoresController::calcularEvolucaoMensal('Riomar', $startDate, $endDate, $conn);
$radarRiomar        = DashboardIndicatoresController::calcularRadarLoja($dash, 'Riomar');
$boxplotDados       = DashboardIndicatoresController::calcularBoxplotDados($dash);
$correlacao         = DashboardIndicatoresController::calcularCorrelacaoIndicadores($dash);
*/
// 4) Nomes legíveis
$nomeMelhorInd = DashboardIndicatoresController::getNomeIndicador($melhorIndicador);
$nomePiorInd   = DashboardIndicatoresController::getNomeIndicador($piorIndicador);



// 1) Puxar raw
$raw = DashboardIndicatoresController::getRawData($startDate, $endDate, $conn);



$mediaRiomar = $dash['lojas']['Riomar']['media_ponderada'] ?? 0;
$mediaJardins = $dash['lojas']['Jardins']['media_ponderada'] ?? 0;
$mediaGarcia = $dash['lojas']['Garcia']['media_ponderada'] ?? 0;
$mediaTreze = $dash['lojas']['Treze']['media_ponderada'] ?? 0;
?>
<div id="dashboard-indicator" class="row indicators-dash justify-content-center mt-5">
  <div class="col-6 col-md-6 col-lg-3">
    <div class="card small">
      <div class="content">
        <span class="icon material-symbols-outlined">receipt</span>
        <div class="texts">
          <h6 class="sub">
            Melhor Loja
          </h6>
          <h4 class="title">
            <?= $melhorLoja ?>
          </h4>
        </div>
      </div>
    </div>
  </div>
  <div class="col-6 col-md-6 col-lg-3">
    <div class="card small">
      <div class="content">
        <span class="icon material-symbols-outlined">receipt</span>
        <div class="texts">
          <h6 class="sub">
            Pior Loja
          </h6>
          <h4 class="title">
            <?= $piorLoja ?>
          </h4>
        </div>
      </div>
    </div>
  </div>
  <div class="col-6 col-md-6 col-lg-3">
    <div class="card small">
      <div class="content">
        <span class="icon material-symbols-outlined">receipt</span>
        <div class="texts">
          <h6 class="sub">
            Melhor Indicador
          </h6>
          <h4 class="title">
            <?= $melhorIndicador ?>
            <?= $nomeMelhorInd ?>
          </h4>
        </div>
      </div>
    </div>
  </div>
  <div class="col-6 col-md-6 col-lg-3">
    <div class="card small">
      <div class="content">
        <span class="icon material-symbols-outlined">receipt</span>
        <div class="texts">
          <h6 class="sub">
            Pior Indicador
          </h6>
          <h4 class="title">
            <?= $piorIndicador ?>
            <?= $nomePiorInd ?>
          </h4>
        </div>
      </div>
    </div>
  </div>

</div>

<div id="dashboard-indicator" class="row indicators-dash justify-content-center my-5">
  <div class="col-12">
    <div class="card h-100">
      <div class="content">
        <h3>Nota Geral das Lojas em todos indicadores</h3>
        <div id="chartDashboard"></div>
      </div>
    </div>
  </div>
</div>



<!--
<h4>Indicadores não avaliados Riomar: <?= $naoAvaliadosRiomar ?></h4>
<h4>Evolução Riomar: <?= $evolucaoRiomar ?></h4>
<h4>Radar Riomar: <?= $radarRiomar ?></h4>


<h4>box plot dados: <?= $boxplotDados ?></h4>
<h4>Correlação: <?= $correlacao ?></h4>

  -->