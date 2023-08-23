import {Args, Command, Flags} from '@oclif/core'
import {OrmpRelay, RelayConfig, StartRelayFlag, StartInput, StartTask} from "@darwinia/ormpipe-relay"
import {logger} from "@darwinia/ormpipe-logger";
import * as enquirer from 'enquirer';

const camelize = require('camelize')
// const { prompt } = require('enquirer')

export default class Start extends Command {
  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    'source-name': Flags.string({
      required: true,
      description: '[source-chain] name',
      default: 'source',
      env: 'ORMPIPE_SOURCE_NAME',
    }),
    'source-endpoint': Flags.string({
      required: true,
      description: '[source-chain] endpoint',
      env: 'ORMPIPE_SOURCE_ENDPOINT',
    }),

    'target-name': Flags.string({
      required: true,
      description: '[target-chain] name',
      default: 'target',
      env: 'ORMPIPE_TARGET_NAME',
    }),
    'target-endpoint': Flags.string({
      required: true,
      description: '[target-chain] endpoint',
      env: 'ORMPIPE_TARGET_ENDPOINT',
    }),

    'source-indexer-endpoint': Flags.string({
      required: false,
      description: '[source-chain] indexer endpoint',
      env: 'ORMPIPE_SOURCE_INDEXER_ENDPOINT',
    }),
    'source-indexer-oracle-endpoint': Flags.string({
      required: false,
      description: '[source-chain] indexer for oracle endpoint, default use --source-indexer-endpoint',
      env: 'ORMPIPE_SOURCE_INDEXER_ORACLE_ENDPOINT',
    }),
    'source-indexer-relayer-endpoint': Flags.string({
      required: false,
      description: '[source-chain] indexer for relayer endpoint, default use --source-indexer-endpoint',
      env: 'ORMPIPE_SOURCE_RELAYER_ENDPOINT',
    }),
    'source-indexer-ormp-endpoint': Flags.string({
      required: false,
      description: '[source-chain] indexer for ormp endpoint, default use --source-indexer-endpoint',
      env: 'ORMPIPE_SOURCE_ORMP_ENDPOINT',
    }),
    'source-indexer-airnode-endpoint': Flags.string({
      required: false,
      description: '[source-chain] indexer for airnode endpoint, default use --source-indexer-endpoint',
      env: 'ORMPIPE_SOURCE_AIRNODE_ENDPOINT',
    }),

    'target-indexer-endpoint': Flags.string({
      required: false,
      description: '[target-chain] indexer endpoint',
      env: 'ORMPIPE_TARGET_ENDPOINT',
    }),
    'target-indexer-oracle-endpoint': Flags.string({
      required: false,
      description: '[target-chain] indexer for oracle endpoint, default use --target-indexer-endpoint',
      env: 'ORMPIPE_TARGET_INDEXER_ORACLE_ENDPOINT',
    }),
    'target-indexer-relayer-endpoint': Flags.string({
      required: false,
      description: '[target-chain] indexer for relayer endpoint, default use --target-indexer-endpoint',
      env: 'ORMPIPE_TARGET_INDEXER_RELAYER_ENDPOINT',
    }),
    'target-indexer-ormp-endpoint': Flags.string({
      required: false,
      description: '[target-chain] indexer for ormp endpoint, default use --target-indexer-endpoint',
      env: 'ORMPIPE_TARGET_INDEXER_ORMP_ENDPOINT',
    }),
    'target-indexer-airnode-endpoint': Flags.string({
      required: false,
      description: '[target-chain] indexer for airnode endpoint, default use --target-indexer-endpoint',
      env: 'ORMPIPE_TARGET_INDEXER_AIRNODE_ENDPOINT',
    }),

    'source-signer': Flags.boolean({
      required: false,
      description: '[source-chain] get source signer interactively',
    }),
    'source-signer-oracle': Flags.boolean({
      required: false,
      description: '[source-chain] get source signer for oracle contract interactively',
    }),
    'target-signer': Flags.boolean({
      required: false,
      description: '[target-chain] get target signer interactively',
    }),
    'target-signer-oracle': Flags.string({
      required: false,
      description: '[target-chain] get target signer for oracle contract interactively',
    }),
  }

  static args = {
    task: Args.string({
      required: true,
      description: 'relay task name',
      options: ['oracle', 'relayer'],
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Start)

    const {task} = args;

    const rawRelayFlags = camelize(flags) as unknown as StartRelayFlag;
    const relayConfig = await this.buildFlag(rawRelayFlags);
    console.log(relayConfig)

    const ormpRelay = new OrmpRelay(relayConfig);
    const input: StartInput = {
      task: task as unknown as StartTask,
    };
    try {
      await ormpRelay.start(input);
    } catch (e: any) {
      logger.error(e, {target: 'cli', breads: ['ormpipe', 'start', 'task']})
    }
  }

  private async buildFlag(rawRelayFlags: StartRelayFlag): Promise<RelayConfig> {
    const relayConfig: StartRelayFlag = {
      ...rawRelayFlags,

      sourceIndexerOracleEndpoint: rawRelayFlags.sourceIndexerOracleEndpoint ?? rawRelayFlags.sourceIndexerEndpoint,
      sourceIndexerRelayerEndpoint: rawRelayFlags.sourceIndexerRelayerEndpoint ?? rawRelayFlags.sourceIndexerEndpoint,
      sourceIndexerOrmpEndpoint: rawRelayFlags.sourceIndexerOrmpEndpoint ?? rawRelayFlags.sourceIndexerEndpoint,
      sourceIndexerAirnodeEndpoint: rawRelayFlags.sourceIndexerAirnodeEndpoint ?? rawRelayFlags.sourceIndexerEndpoint,

      targetIndexerOracleEndpoint: rawRelayFlags.targetIndexerOracleEndpoint ?? rawRelayFlags.targetIndexerEndpoint,
      targetIndexerRelayerEndpoint: rawRelayFlags.targetIndexerRelayerEndpoint ?? rawRelayFlags.targetIndexerEndpoint,
      targetIndexerOrmpEndpoint: rawRelayFlags.targetIndexerOrmpEndpoint ?? rawRelayFlags.targetIndexerEndpoint,
      targetIndexerAirnodeEndpoint: rawRelayFlags.targetIndexerAirnodeEndpoint ?? rawRelayFlags.targetIndexerEndpoint,
    };
    const sourceSigner = await this.interactiveValue({
      required: false,
      enable: !!relayConfig.sourceSigner,
      type: 'password',
      name: 'source-signer',
      message: 'missing --source-signer or ORMPIPE_SOURCE_SIGNER',
      title: 'please type source signer',
      default: process.env.ORMPIPE_SOURCE_SIGNER,
    });
    const sourceSignerOracle = await this.interactiveValue({
      required: false,
      enable: !!relayConfig.sourceSignerOracle,
      type: 'password',
      name: 'source-signer-oracle',
      message: 'missing --source-signer-oracle or ORMPIPE_SOURCE_SIGNER_ORACLE',
      title: 'please type source signer for oracle contract',
      default: process.env.ORMPIPE_SOURCE_SIGNER_ORACLE,
    });
    const targetSigner = await this.interactiveValue({
      required: false,
      enable: !!relayConfig.targetSigner,
      type: 'password',
      name: 'target-signer',
      message: 'missing --target-signer or ORMPIPE_TARGET_SIGNER',
      title: 'please type target signer',
      default: process.env.ORMPIPE_TARGET_SIGNER,
    });
    const targetSignerOracle = await this.interactiveValue({
      required: false,
      enable: !!relayConfig.targetSignerOracle,
      type: 'password',
      name: 'target-signer-oracle',
      message: 'missing --target-signer-oracle or ORMPIPE_TARGET_SIGNER_ORACLE',
      title: 'please type target signer for oracle contract',
      default: process.env.ORMPIPE_TARGET_SIGNER_ORACLE,
    });


    return {
      ...relayConfig,
      sourceSigner,
      sourceSignerOracle: sourceSignerOracle ?? sourceSigner,
      targetSigner,
      targetSignerOracle: targetSignerOracle ?? targetSigner,
    } as RelayConfig;
  }

  private async interactiveValue(options: {
    required: boolean,
    enable: boolean,
    type?: string,
    name: string,
    message?: string,
    title: string,
    default?: string,
  }): Promise<string | undefined> {
    let value = options.default;

    if (options.enable) {
      const response: {field: string} = await enquirer.prompt({
        type: options.type ?? 'input',
        name: 'field',
        message: options.title,
        validate: async input => {
          if (!input) return options.title;
          return true;
        }
      });
      if (response.field) {
        value = response.field;
      }
    }

    if (!value && options.required) {
      logger.error(options.message ?? `missing ${options.name}`);
      process.exit(1);
    }
    return value;
  }
}
