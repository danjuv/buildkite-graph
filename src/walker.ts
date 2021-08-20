import {
  PotentialStep,
  Pipeline,
  Conditional,
  Command,
  CommandStep,
  Step,
} from '.';
import { getAndCacheDependency } from './conditional';
import { cloneDeep } from 'lodash';
export interface Mutators {
  pipelineFn?: (pipeline: Pipeline) => Promise<void>;
  stepFn?: (step: Step) => Promise<void>;
  commandFn?: (command: Command) => Promise<void>;
}

/**
 * @param p The pipeline to evaluate
 * @returns An evaluated pipeline with all conditionals generated if they were accepted
 */
export async function evaluatePipeline(pipeline: Pipeline): Promise<Pipeline> {
  console.log('evaluating')
  const conditionalCache = new Map<any, any>();
  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const newStep = await evaluateStep(step, conditionalCache);
    if (newStep) {
      pipeline.steps[i] = newStep;
    }
  }
  console.log('done')
  return pipeline;
}

async function evaluateStep(
  step: PotentialStep,
  conditionalCache: Map<any, any>,
): Promise<Step | null> {
  console.log('evaluating step')
  if (step instanceof Conditional) {
    if (await step.accept()) {
      step = await getAndCacheDependency(conditionalCache, step);
    } else {
      return null;
    }
  }
  const deps = step.dependencies;
  const newDeps: Set<PotentialStep> = new Set();
  for (const dep of deps) {
    // auto-accept all conditionals if they are a dependency
    const newDep = await getAndCacheDependency(conditionalCache, dep);
    deps.delete(dep);
    if (newDep) {
      newDeps.add(newDep);
    }
  }
  newDeps.forEach((dep) =>{
    deps.add(dep)})
  return step;
}

export async function walk(p: Pipeline, mutator: Mutators): Promise<Pipeline> {
  const nodeCache = new Map<any, any>();
  async function walkStep(step: PotentialStep) {
    if (step instanceof Conditional) {
      throw new Error(
        `encountered conditional during walk, please run evaluatePipeline`,
      );
    }

    if (nodeCache.has(step)) {
      return;
    }
    if (step instanceof CommandStep) {
      for (const dep of step.dependencies) {
        await walkStep(dep);
      }
    }
    if (mutator.stepFn) {
      const depsBefore = cloneDeep(step.dependencies);
      const effectsBefore = cloneDeep(step.effectDependencies);
      await mutator.stepFn(step);
    }
    nodeCache.set(step, step);
  }

  for (const step of p.steps) {
    await walkStep(step);
  }
  return p;
}
