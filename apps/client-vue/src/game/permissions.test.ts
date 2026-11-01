import { describe, expect, it } from "vitest";
import { legalTargets, playerAction, visibleRole } from "./permissions";
import type {
  PrivateState,
  RoomPublicState,
} from "../../../../packages/protocol/src/types";

const state = (): RoomPublicState => ({
  roomId: "r",
  hostPlayerId: "human",
  gameId: "g",
  controllerEpoch: 1,
  controllerPhase: "ready",
  preparing: false,
  phase: "VOTE",
  version: 1,
  round: 0,
  currentSeatId: null,
  submittedVoteRound: null,
  submittedVoteSeatIds: [],
  seats: ["P1", "P2", "P3", "P4"].map((seatId) => ({
    seatId,
    displayName: seatId,
    alive: true,
    playerType: "human",
    controlSource: "human",
  })),
  controllers: [],
  speeches: [],
  voteResolutions: [],
  events: [],
  hostPlaybackEnabled: false,
  hostPlaybackBlocked: false,
});
const mine = (): PrivateState => ({
  roomId: "r",
  seatId: "P1",
  playerId: "human",
  role: "werewolf",
  camp: "werewolf",
  alive: true,
  skills: {},
  seerResults: [],
  currentTurn: null,
  hunterAction: null,
  werewolfTeammates: ["P2"],
});
describe("live action and identity boundaries", () => {
  it("only permits non-candidates to vote for tied players", () => {
    const s = state(),
      m = mine();
    s.pk = { round: 0, stage: "vote", candidates: ["P2", "P3"] };
    expect(playerAction(s, m)).toBe("vote");
    expect(legalTargets(s, m, "vote").map((x) => x.seatId)).toEqual([
      "P2",
      "P3",
    ]);
    s.pk.candidates.push("P1");
    expect(playerAction(s, m)).toBeNull();
  });
  it("shows a dead hunter action during public resolution", () => {
    const s = state(),
      m = mine();
    s.phase = "RESOLUTION";
    m.alive = false;
    m.role = "hunter";
    m.hunterAction = {
      windowId: "w",
      expiresAt: "2030-01-01",
      targetSeatIds: ["P3"],
    };
    expect(playerAction(s, m)).toBe("hunter");
    expect(legalTargets(s, m, "hunter").map((x) => x.seatId)).toEqual(["P3"]);
    m.hunterAction = null;
    expect(playerAction(s, m)).toBeNull();
  });
  it("keeps hidden and dead seats veiled and only reveals legal teammates", () => {
    const m = mine();
    expect(visibleRole("P1", m, false)).toBeNull();
    expect(visibleRole("P2", m, false)).toBeNull();
    expect(visibleRole("P2", m, true)).toBe("werewolf");
    expect(visibleRole("P3", m, true)).toBeNull();
    m.role = "seer";
    expect(visibleRole("P2", m, true)).toBeNull();
  });
  it("follows wolf proposal without offering self or teammates", () => {
    const s = state(),
      m = mine();
    s.phase = "NIGHT_WOLF";
    m.wolfProposal = "P3";
    expect(legalTargets(s, m, "skill").map((x) => x.seatId)).toEqual(["P3"]);
  });
  it("does not reopen submitted votes or permit AI-controlled human actions", () => {
    const s = state(),
      m = mine();
    s.submittedVoteSeatIds = ["P1"];
    expect(playerAction(s, m)).toBeNull();
    s.submittedVoteSeatIds = [];
    s.seats[0].controlSource = "rule_bot";
    expect(playerAction(s, m)).toBeNull();
  });
});
