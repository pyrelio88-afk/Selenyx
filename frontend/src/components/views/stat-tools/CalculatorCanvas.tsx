import type { CalcKey } from './catalog';
import {
  PValueCalc, TTestCalc, PairedTTestCalc, OneSampleTTestCalc, AnovaCalc,
  ChiSquareCalc, OrrrCalc, DiagTestCalc, CorrelationCalc, EffectSizeCalc,
  SampleSizeCalc, CICalc,
} from './InferenceCalculators';
import {
  CronbachCalc, RegressionCalc, MannWhitneyCalc, LogisticRegCalc, ROCCalc, SurvivalCalc,
} from './AdvancedCalculators';

export function CalculatorCanvas({ calc }: { calc: CalcKey }) {
  return (
    <>
      {calc === 'pvalue' && <PValueCalc />}
      {calc === 'ttest' && <TTestCalc />}
      {calc === 'pairedt' && <PairedTTestCalc />}
      {calc === 'onesamplet' && <OneSampleTTestCalc />}
      {calc === 'anova' && <AnovaCalc />}
      {calc === 'chi' && <ChiSquareCalc />}
      {calc === 'orrr' && <OrrrCalc />}
      {calc === 'diagtest' && <DiagTestCalc />}
      {calc === 'correlation' && <CorrelationCalc />}
      {calc === 'effectsize' && <EffectSizeCalc />}
      {calc === 'samplesize' && <SampleSizeCalc />}
      {calc === 'ci' && <CICalc />}
      {calc === 'cronbach' && <CronbachCalc />}
      {calc === 'regression' && <RegressionCalc />}
      {calc === 'mannwhitney' && <MannWhitneyCalc />}
      {calc === 'logistic' && <LogisticRegCalc />}
      {calc === 'roc' && <ROCCalc />}
      {calc === 'survival' && <SurvivalCalc />}
    </>
  );
}
