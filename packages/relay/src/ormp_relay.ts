import {OracleRelay} from "./relay/oracle";
import {RelayConfig, StartInput, StartTask} from "./types/config";
import {ethers} from "ethers";
import {BaseLifecycle, OracleLifecycle, RelayerLifecycle} from "./types/lifecycle";
import {OrmpipeIndexer} from "@darwinia/ormpipe-indexer";
import {RelayerRelay} from "./relay/relayer";
import {RelayDirection} from "./types/mark";
import {ThegraphIndexer} from "@darwinia/ormpipe-indexer/dist/thegraph";
import {RelayClient} from "./client";

export class OrmpRelay {
  constructor(
    private readonly config: RelayConfig
  ) {
  }

  public async start(input: StartInput) {
    // start ormp relay

    // source -> target
    const sourceToTargetConfig: RelayConfig = {...this.config};
    // target -> source
    // const targetToSourceConfig: RelayConfig = {
    //   sourceName: this.config.targetName,
    //   sourceEndpoint: this.config.targetEndpoint,
    //   targetName: this.config.sourceName,
    //   targetEndpoint: this.config.sourceEndpoint,
    //   sourceIndexerEndpoint: this.config.targetIndexerEndpoint,
    //   sourceIndexerOracleEndpoint: this.config.targetIndexerOracleEndpoint,
    //   sourceIndexerRelayerEndpoint: this.config.targetIndexerRelayerEndpoint,
    //   sourceIndexerOrmpEndpoint: this.config.targetIndexerOrmpEndpoint,
    //   sourceIndexerAirnodeEndpoint: this.config.targetIndexerAirnodeEndpoint,
    //   targetIndexerEndpoint: this.config.sourceIndexerEndpoint,
    //   targetIndexerOracleEndpoint: this.config.sourceIndexerOracleEndpoint,
    //   targetIndexerRelayerEndpoint: this.config.sourceIndexerRelayerEndpoint,
    //   targetIndexerOrmpEndpoint: this.config.sourceIndexerOrmpEndpoint,
    //   targetIndexerAirnodeEndpoint: this.config.sourceIndexerAirnodeEndpoint,
    // };

    switch (input.task) {
      case StartTask.oracle: {
        const lifecycle = await this.initOracleLifecycle(sourceToTargetConfig, RelayDirection.SourceToTarget);
        const relayer = new OracleRelay(lifecycle);
        await relayer.start();
        break;
      }
      case StartTask.relayer: {
        const lifecycle = await this.initRelayerLifecycle(sourceToTargetConfig, RelayDirection.TargetToSource);
        const relayer = new RelayerRelay(lifecycle);
        await relayer.start();
        break;
      }
    }

  }

  private async initOracleLifecycle(config: RelayConfig, direction: RelayDirection): Promise<OracleLifecycle> {
    if (!config.sourceIndexerOracleEndpoint) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--source-indexer-oracle-endpoint or --source-indexer-endpoint'
            : '--target-indexer-oracle-endpoint or --target-indexer-endpoint'
        )
      );
    }
    if (!config.sourceIndexerOrmpEndpoint) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--source-indexer-ormp-endpoint or --source-indexer-endpoint'
            : '--target-indexer-ormp-endpoint or --target-indexer-endpoint'
        )
      );
    }
    if (!config.targetIndexerOrmpEndpoint) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--target-indexer-ormp-endpoint or --target-indexer-endpoint'
            : '--source-indexer-ormp-endpoint or --source-indexer-endpoint'
        )
      );
    }
    if (!config.targetAddressAirnode) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--target-address-airnode'
            : '--source-address-airnode'
        )
      );
    }

    const sourceIndexer = this.initSourceIndexer(config);
    const targetIndexer = this.initTargetIndexer(config);

    const baseLifecycle = await this.initBaseLifecycle(config, direction);
    return {
      ...baseLifecycle,
      sourceIndexerOracle: sourceIndexer.oracle(),
      sourceIndexerOrmp: sourceIndexer.ormp(),
      targetIndexerOrmp: targetIndexer.ormp(),
      targetIndexerAirnode: targetIndexer.airnode(),
      targetAirnodeClient: baseLifecycle.targetClient.airnode(config.targetAddressAirnode),
    };
  }

  private async initRelayerLifecycle(config: RelayConfig, direction: RelayDirection): Promise<RelayerLifecycle> {
    if (!config.sourceIndexerOracleEndpoint) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--source-indexer-relayer-endpoint or --source-indexer-endpoint'
            : '--target-indexer-relayer-endpoint or --target-indexer-endpoint'
        )
      );
    }
    if (!config.sourceIndexerOrmpEndpoint) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--source-indexer-ormp-endpoint or --source-ormp-endpoint'
            : '--target-indexer-ormp-endpoint or --target-ormp-endpoint'
        )
      );
    }
    if (!config.targetIndexerOrmpEndpoint) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--target-indexer-ormp-endpoint or --target-ormp-endpoint'
            : '--source-indexer-ormp-endpoint or --source-ormp-endpoint'
        )
      );
    }
    if (!config.targetAddressRelayer) {
      throw new Error(
        'missing ' + (
          direction == RelayDirection.SourceToTarget
            ? '--target-address-relayer'
            : '--source-address-relayer'
        )
      );
    }
    const sourceIndexer = this.initSourceIndexer(config);
    const targetIndexer = this.initTargetIndexer(config);

    const baseLifecycle = await this.initBaseLifecycle(config, direction);
    return {
      ...baseLifecycle,
      sourceIndexerOrmp: sourceIndexer.ormp(),
      sourceIndexerRelayer: sourceIndexer.relayer(),
      targetIndexerOrmp: targetIndexer.ormp(),
      targetIndexerAirnode: targetIndexer.airnode(),
      targetRelayerClient: baseLifecycle.targetClient.relayer(config.targetAddressRelayer),
    };
  }

  private async initBaseLifecycle(config: RelayConfig, direction: RelayDirection): Promise<BaseLifecycle> {
    const sourceClient = new RelayClient({
      name: config.sourceName,
      endpoint: config.sourceEndpoint,
      signer: config.sourceSigner,
      signerAirnode: config.sourceSignerAirnode,
      signerRelayer: config.sourceSignerRelayer,
    });
    const targetClient = new RelayClient({
      name: config.targetName,
      endpoint: config.targetEndpoint,
      signer: config.targetSigner,
      signerAirnode: config.targetSignerAirnode,
      signerRelayer: config.targetSignerRelayer,
    });
    return {
      direction,
      sourceName: config.sourceName,
      targetName: config.targetName,
      sourceClient,
      targetClient,
    };
  }

  private initSourceIndexer(config: RelayConfig): ThegraphIndexer {
    return new OrmpipeIndexer({
      endpoint: config.sourceIndexerEndpoint,
      oracleEndpoint: config.sourceIndexerOracleEndpoint,
      relayerEndpoint: config.sourceIndexerRelayerEndpoint,
      ormpEndpoint: config.sourceIndexerOrmpEndpoint,
      airnodeEndpoint: config.sourceIndexerAirnodeEndpoint,
    }).thegraph();
  }

  private initTargetIndexer(config: RelayConfig): ThegraphIndexer {
    return new OrmpipeIndexer({
      endpoint: config.targetIndexerEndpoint,
      oracleEndpoint: config.targetIndexerOracleEndpoint,
      relayerEndpoint: config.targetIndexerRelayerEndpoint,
      ormpEndpoint: config.targetIndexerOrmpEndpoint,
      airnodeEndpoint: config.targetIndexerAirnodeEndpoint,
    }).thegraph();
  }
}
