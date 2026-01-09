import { RelayerRelayLifecycle } from "./types/config";
import { CommonRelay, logger, RelayStorage } from "@darwinia/ormpipe-common";
import {
  OracleImportedMessageHash,
  OrmpMessageAccepted,
  SqdIndexOrmp,
} from "@darwinia/ormpipe-indexer";
import {
  OrmpProtocolMessage,
  RelayerContractClient,
} from "./client/contract_relayer";
import {
  setTimeout,
} from 'timers/promises';
import chalk = require("chalk");

interface RelayerRelayOptions {
  times: number;
  sourceChainId: number;
  targetChainId: number;
}

interface RelayerRelayFullOptions extends RelayerRelayOptions {
  lastImportedMessageHash: OracleImportedMessageHash;
  previousResult?: LastAssignedMessageAccepted;
}

type RelayResult = "try-next" | "success";
interface LastAssignedMessageAccepted {
  unrelayMessageAcepted?: OrmpMessageAccepted;
  unRelayMessageAcceptedList: OrmpMessageAccepted[];
  sourceLastMessageAssignedAccepted?: OrmpMessageAccepted;
}

export class RelayerRelay extends CommonRelay<RelayerRelayLifecycle> {
  private static CK_RELAYER_RELAIED = "ormpipe.relayer.relaied";
  private static CK_RELAYER_SKIPPED = "ormpipe.relayer.skipped";

  private _sourceRelayerContractClient?: RelayerContractClient;
  private _targetRelayerContractClient?: RelayerContractClient;

  constructor(lifecycle: RelayerRelayLifecycle) {
    super(lifecycle);
  }

  public get sourceIndexerOrmp(): SqdIndexOrmp {
    return super.lifecycle.sourceIndexerOrmp;
  }

  public get targetIndexerOrmp(): SqdIndexOrmp {
    return super.lifecycle.targetIndexerOrmp;
  }

  public get sourceRelayerClient(): RelayerContractClient {
    if (this._sourceRelayerContractClient)
      return this._sourceRelayerContractClient;
    this._sourceRelayerContractClient = new RelayerContractClient({
      chainName: super.sourceName,
      signer: super.lifecycle.sourceSigner,
      address: super.lifecycle.sourceChain.contract.relayer,
      evm: super.sourceClient.evm,
      endpoint: super.sourceClient.config.endpoint,
    });
    return this._sourceRelayerContractClient;
  }

  public get targetRelayerClient(): RelayerContractClient {
    if (this._targetRelayerContractClient)
      return this._targetRelayerContractClient;
    this._targetRelayerContractClient = new RelayerContractClient({
      chainName: super.targetName,
      signer: super.lifecycle.targetSigner,
      address: super.lifecycle.targetChain.contract.relayer,
      evm: super.targetClient.evm,
      endpoint: super.targetClient.config.endpoint,
    });
    return this._targetRelayerContractClient;
  }

  public async start() {
    try {
      const sourceChainId = await super.sourceChainId();
      const targetChainId = await super.targetChainId();

      const options: RelayerRelayOptions = {
        sourceChainId,
        targetChainId,
        times: this.lifecycle.times,
      };
      await this.relay(options);
    } catch (e: any) {
      logger.error(e, super.meta("ormpipe-relay"));
    }
  }

  private async relay(options: RelayerRelayOptions) {
    logger.debug(
      "start relayer relay",
      super.meta("ormpipe-relay-relayer", ["relayer"])
    );

    logger.debug(
      `query last message dispatched from ${super.sourceName}`,
      super.meta("ormpipe-relay", ["relayer:relay"])
    );

    const lastImportedMessageHash =
      await super.lifecycle.targetIndexerOrmp.lastImportedMessageHash({
        fromChainId: options.sourceChainId,
        toChainId: options.targetChainId,
      });
    if (!lastImportedMessageHash) {
      logger.info(
        "not have any imported message from %s",
        super.sourceName,
        super.meta("ormpipe-relay-relayer", ["relayer"])
      );
      return;
    }

    let lastAssignedMessageAcceptedResult:
      | LastAssignedMessageAccepted
      | undefined;
    let times = 0;
    while (true) {
      times += 1;
      if (times > 5) {
        logger.warn(
          `reach max relay times to submit relayer.relay`,
          super.meta("ormpipe-relay", ["relayer"])
        );
        break;
      }
      const fullOptions = {
        ...options,
        lastImportedMessageHash,
        times: options.times,
        previousResult: lastAssignedMessageAcceptedResult,
      };
      lastAssignedMessageAcceptedResult =
        await this._lastAssignedMessageAccepted(fullOptions);
      if (
        !lastAssignedMessageAcceptedResult ||
        !lastAssignedMessageAcceptedResult.unrelayMessageAcepted
      ) {
        logger.info(
          `no new assigned message accepted`,
          super.meta("ormpipe-relay", ["relayer"])
        );
        return;
      }
      const result = await this._relay(
        fullOptions,
        lastAssignedMessageAcceptedResult.unrelayMessageAcepted
      );
      if (result == "try-next") {
        logger.info(
          `try next message accepted`,
          super.meta("ormpipe-relay", ["relayer"])
        );
        if (options.targetChainId == 1) {
          await setTimeout(1000 * 60);
        } else {
          await setTimeout(1000 * 40);
        }
        continue;
      }
      if (result == "success") {
        logger.info(
          `message relayed successfully %s`,
          lastAssignedMessageAcceptedResult.unrelayMessageAcepted.index,
          super.meta("ormpipe-relay", ["relayer"])
        );
        return;
      }
    }
  }

  private async _relay(
    options: RelayerRelayFullOptions,
    sourceNextMessageAccepted: OrmpMessageAccepted
  ): Promise<RelayResult> {
    if (
      options.sourceChainId.toString() !=
        sourceNextMessageAccepted.fromChainId ||
      options.targetChainId.toString() != sourceNextMessageAccepted.toChainId
    ) {
      logger.warn(
        `expected chain id relation is [%s -> %s], but the message %s(%s) chain id relations is [%s -> %s] skip this message`,
        options.sourceChainId.toString(),
        options.targetChainId.toString(),
        sourceNextMessageAccepted.msgHash,
        sourceNextMessageAccepted.index,
        sourceNextMessageAccepted.fromChainId,
        sourceNextMessageAccepted.toChainId,
        super.meta("ormpipe-relay-relayer", ["relayer"])
      );
      await super.storage.put(
        RelayerRelay.CK_RELAYER_RELAIED,
        sourceNextMessageAccepted.index
      );
      return "success";
    }
    const message: OrmpProtocolMessage = {
      channel: sourceNextMessageAccepted.channel,
      index: +sourceNextMessageAccepted.index,
      fromChainId: +sourceNextMessageAccepted.fromChainId,
      from: sourceNextMessageAccepted.from,
      toChainId: +sourceNextMessageAccepted.toChainId,
      to: sourceNextMessageAccepted.to,
      gasLimit: BigInt(sourceNextMessageAccepted.gasLimit),
      encoded: sourceNextMessageAccepted.encoded,
    };

    const sim = new SkippedIndexManager(
      super.storage,
      RelayerRelay.CK_RELAYER_SKIPPED
    );

    // console.log('------ relay');
    const baseGas = await this.sourceRelayerClient.configOf(
      options.targetChainId
    );

    let targetTxRelayMessage;
    try {
      // console.log("\n\n###########")
      // console.log("sourceNextMessageAccepted.gasLimit", sourceNextMessageAccepted.gasLimit)
      // console.log("baseGas", baseGas)
      // console.log("BigInt(sourceNextMessageAccepted.gasLimit) * BigInt(64) / BigInt(63) + baseGas + BigInt(100000)", BigInt(sourceNextMessageAccepted.gasLimit) * BigInt(64) / BigInt(63) + baseGas + BigInt(100000));
      // console.log("###########\n\n")
      targetTxRelayMessage = await this.targetRelayerClient.relay({
        message,
        gasLimit:
          (BigInt(sourceNextMessageAccepted.gasLimit) * BigInt(64)) /
            BigInt(63) +
          baseGas +
          BigInt(100000),
        chainId: options.targetChainId,
      });
    } catch (e: any) {
      logger.error(
        "failed to relay message %s(%s) to %s: %s",
        message.index,
        super.sourceName,
        super.targetName,
        e ? e.message : e,
        super.meta("ormpipe-relay", ["relayer:relay"])
      );
      await sim.put(+message.index);
      return "try-next";
    }

    if (!targetTxRelayMessage) {
      logger.warn(
        "gas increase rate is too high, skip message %s in %s",
        message.index,
        super.sourceName,
        super.meta("ormpipe-relay", ["relayer:relay"])
      );
      await sim.put(message.index);
      return "try-next";
    }
    logger.info(
      "message relayed to %s {tx: %s, block: %s}",
      super.targetName,
      chalk.magenta(targetTxRelayMessage.hash || targetTxRelayMessage),
      chalk.cyan(targetTxRelayMessage.blockNumber),
      super.meta("ormpipe-relay", ["relayer:relay"])
    );

    await sim.remove(message.index);
    await super.storage.put(RelayerRelay.CK_RELAYER_RELAIED, message.index);
    return "success";
  }

  private async _lastAssignedMessageAccepted(
    options: RelayerRelayFullOptions
  ): Promise<LastAssignedMessageAccepted | undefined> {
    const lastImportedMessageHash = options.lastImportedMessageHash;
    const lastImportedMessageAccepted =
      await this.sourceIndexerOrmp.inspectMessageAccepted({
        chainId: options.sourceChainId,
        msgHash: lastImportedMessageHash.hash,
      });

    if (!lastImportedMessageAccepted) {
      logger.debug(
        "found new message root %s from %s but not found this message from accepted.",
        lastImportedMessageHash.hash,
        super.targetName,
        super.meta("ormpipe-relay-relayer", ["relayer"])
      );
      return undefined;
    }

    let unRelayMessageAcceptedList =
      options.previousResult?.unRelayMessageAcceptedList;
    if (!unRelayMessageAcceptedList) {
      const pickedRelayerMessageAcceptedHashes =
        await this.sourceIndexerOrmp.pickRelayerMessageAcceptedHashes({
          messageIndex: +lastImportedMessageAccepted.index,
          fromChainId: options.sourceChainId,
          toChainId: options.targetChainId,
        });
      const pickedUnRelayedMessageHashes =
        await this.targetIndexerOrmp.pickUnRelayedMessageHashes(
          options.targetChainId,
          pickedRelayerMessageAcceptedHashes
        );
      unRelayMessageAcceptedList =
        await this.sourceIndexerOrmp.queryMessageAcceptedListByHashes({
          chainId: options.sourceChainId,
          msgHashes: pickedUnRelayedMessageHashes,
        });
    }

    if (!unRelayMessageAcceptedList.length) {
      logger.debug(
        "not found wait relay messages from %s",
        super.sourceName,
        super.meta("ormpipe-relay-relayer", ["relayer"])
      );
      return undefined;
    }

    let sourceLastMessageAssignedAccepted =
      options.previousResult?.sourceLastMessageAssignedAccepted;
    if (!sourceLastMessageAssignedAccepted) {
      sourceLastMessageAssignedAccepted =
        await this.sourceIndexerOrmp.lastRelayerAssigned({
          fromChainId: options.sourceChainId,
          toChainId: options.targetChainId,
        });
    }

    let unRelayedIndex = -1;
    while (true) {
      unRelayedIndex += 1;
      if (unRelayMessageAcceptedList.length - 1 < unRelayedIndex) {
        logger.info(
          "not have more unrelayed message acceipte list from %s",
          super.sourceName,
          super.meta("ormpipe-relay-relayer", ["relayer"])
        );
        return;
      }
      const nextUnRelayMessageAccepted =
        unRelayMessageAcceptedList[unRelayedIndex];
      const currentMessageIndex = nextUnRelayMessageAccepted.index;

      const sim = new SkippedIndexManager(
        super.storage,
        RelayerRelay.CK_RELAYER_SKIPPED
      );
      const skippedIndexOfCurrentMessage = await sim.indexOf(
        +currentMessageIndex
      );
      if (skippedIndexOfCurrentMessage > -1) {
        const skippedIndexLength = await sim.length();
        const skippedFactor = skippedIndexLength - skippedIndexOfCurrentMessage;
        if (options.times % (skippedFactor + 2) != 0) {
          logger.info(
            `the message %s (%s) skipped, will retry later`,
            currentMessageIndex,
            super.sourceName,
            super.meta("ormpipe-relay", ["relayer:relay"])
          );
          continue;
        }
        logger.info(
          "retry relay skipped message %s (%s)",
          currentMessageIndex,
          super.sourceName,
          super.meta("ormpipe-relay", ["relayer:relay"])
        );
      }
      const now = new Date();
      if (
        +now - +nextUnRelayMessageAccepted.blockTimestamp >
        1000 * 60 * 60 * 24 * 7
      ) {
        logger.info(
          "the message %s (%s) is too old, skip it",
          currentMessageIndex,
          super.sourceName,
          super.meta("ormpipe-relay", ["relayer:relay"])
        );
        await sim.put(+currentMessageIndex);
        continue;
      }

      logger.info(
        "sync status [%s,%s] (%s)",
        currentMessageIndex,
        sourceLastMessageAssignedAccepted?.index ?? -1,
        super.sourceName,
        super.meta("ormpipe-relay", ["relayer:relay"])
      );

      const cachedLastDeliveriedIndex = await super.storage.get(
        RelayerRelay.CK_RELAYER_RELAIED
      );
      if (currentMessageIndex == cachedLastDeliveriedIndex) {
        logger.info(
          `the message %s already relayed to %s (queried by cache)`,
          currentMessageIndex,
          super.targetName,
          super.meta("ormpipe-relay", ["relayer:relay"])
        );
        continue;
      }

      logger.info(
        `new message accepted %s in %s(%s) prepared`,
        nextUnRelayMessageAccepted.msgHash,
        nextUnRelayMessageAccepted.blockNumber,
        super.sourceName,
        super.meta("ormpipe-relay", ["relayer:relay"])
      );

      return {
        unrelayMessageAcepted: nextUnRelayMessageAccepted,
        unRelayMessageAcceptedList,
        sourceLastMessageAssignedAccepted,
      };
    }
  }
}

class SkippedIndexManager {
  constructor(private storage: RelayStorage, private key: string) {}

  private async write(skippedList: number[]) {
    const rawSkipped = skippedList.join(",");
    await this.storage.put(this.key, rawSkipped);
  }

  public async load(): Promise<number[]> {
    const rawSkipped: string | undefined = await this.storage.get(this.key);
    if (!rawSkipped) return [];
    return rawSkipped.split(",").map((item) => +item);
  }

  public async remove(index: number) {
    const skippedList = await this.load();
    const newSkippedList = skippedList.filter((item) => item != index);
    await this.write(newSkippedList);
  }

  public async put(index: number) {
    await this.remove(index);
    const skippedList = await this.load();
    const newSkippedList = [...skippedList, index];
    await this.write(newSkippedList);
  }

  public async indexOf(index: number): Promise<number> {
    const skippedList = await this.load();
    return skippedList.indexOf(index);
  }

  public async length(): Promise<number> {
    const skippedList = await this.load();
    return skippedList.length;
  }

  public async isSkipped(index: number): Promise<boolean> {
    const skippedList = await this.load();
    return skippedList.indexOf(index) > -1;
  }
}
