import { Command, CommandStep, Pipeline, Step, Conditional, walk, Entity } from '../src';
import { YamlSerializer } from '../src/serializers/yaml';
import { unwrapSteps } from '../src/unwrapSteps'
import TopologicalSort from 'topological-sort';

class RetryCommand extends Command {
    constructor(private retries: number, command: Command) {
        super(command.toString(), command.timeout * (retries + 1));
    }

    public serialize(): string {
        return new Array(this.retries + 1).fill(this.command).join(' || ');
    }

    public toString(): string {
        return `${this.command} [retry = ${this.retries}]`;
    }
}

class TestConditional<T extends Step> extends Conditional<T> {
    accept() {
        return true;
    }
}

const install = new Command('yarn', 10);


const lint = new CommandStep([
    install,
    new Command('yarn lint', 5),
]).withKey('lint');

const test = new CommandStep([
    install,
    new Command('yarn test', 10),
]).withKey('test').dependsOn(lint)

const build = new CommandStep([install, new Command('yarn build', 5)]);

const integration = new CommandStep([
    install,
    new Command('yarn integration', 10),
]).dependsOn(build);

const pipeline = new Pipeline('My pipeline').add(new TestConditional(test)).add(integration)

function mutator(entity: Entity): Entity {
    if (entity instanceof Command) {
        if (entity.timeout !== 0 && entity.timeout !== Infinity) {
            return new RetryCommand(1, entity);
        }
    }
    return entity
}

walk(pipeline, mutator).then((p) => {
    new YamlSerializer({ explicitDependencies: true })
        .serialize(p)
        .then(console.log);
})
