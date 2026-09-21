import { simulateCandidate, type CandidateSimulationJob } from './candidateSimulation'

self.onmessage = (event: MessageEvent<CandidateSimulationJob>) => {
  // An unexpected failure must reject the batch, never masquerade as a zero score.
  self.postMessage(simulateCandidate(event.data))
}
