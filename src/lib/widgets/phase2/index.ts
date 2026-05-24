import { crossMarketDivergenceWidget } from "./crossMarketDivergenceWidget";
import { dollarPressureWidget } from "./dollarPressureWidget";
import { goldRiskHedgeWidget } from "./goldRiskHedgeWidget";
import { macroRiskPulseWidget } from "./macroRiskPulseWidget";
import { nasdaqCryptoCorrelationWidget } from "./nasdaqCryptoCorrelationWidget";
import { oilInflationPressureWidget } from "./oilInflationPressureWidget";
import { riskRegimeWidget } from "./riskRegimeWidget";

export const phase2Widgets = [
  macroRiskPulseWidget,
  dollarPressureWidget,
  goldRiskHedgeWidget,
  oilInflationPressureWidget,
  nasdaqCryptoCorrelationWidget,
  crossMarketDivergenceWidget,
  riskRegimeWidget
];

export {
  macroRiskPulseWidget,
  dollarPressureWidget,
  goldRiskHedgeWidget,
  oilInflationPressureWidget,
  nasdaqCryptoCorrelationWidget,
  crossMarketDivergenceWidget,
  riskRegimeWidget
};
