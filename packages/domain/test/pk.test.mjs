import assert from "node:assert/strict";
import {
  createRoom,
  addPlayer,
  fillAiSeats,
  assignRoles,
  publicState,
} from "../src/model.mjs";
import { submitVote, submitSpeech, skipLastWords } from "../src/engine.mjs";
import { actionAvailable } from "../src/turns.mjs";
import { defaultTurn } from "../../../apps/scheduler/src/local.mjs";
import { tickHumanSpeech } from "../../../apps/server/src/human-speech.mjs";
import { publicNarration } from "../../../apps/server/src/voice.mjs";

function setup() {
  const room = createRoom();
  addPlayer(room, { playerId: "host", displayName: "真人" });
  fillAiSeats(room);
  assignRoles(room);
  room.phase = "VOTE";
  room.seats[8].alive = false;
  room.seats.forEach((seat, i) => {
    seat.role =
      i < 3
        ? "werewolf"
        : i === 3
          ? "seer"
          : i === 4
            ? "witch"
            : i === 5
              ? "hunter"
              : "villager";
    seat.camp = i < 3 ? "werewolf" : "good";
    seat.skills.hunterShotAvailable = i === 5;
  });
  return room;
}
function firstTie(room) {
  room.seats
    .filter((s) => s.alive)
    .forEach((seat, i) =>
      submitVote(room, seat.seatId, i % 2 ? "P2" : "P1", `initial-${i}`),
    );
  assert.deepEqual(publicState(room).pk, {
    round: 0,
    stage: "speech",
    candidates: ["P1", "P2"],
  });
  assert.equal(room.phase, "SPEECH");
  assert.equal(room.currentSeatId, "P1");
  assert.deepEqual(publicState(room).submittedVoteSeatIds, []);
}
function pkSpeeches(room) {
  submitSpeech(room, "P1", "PK 一号发言", "pk-speech-1");
  assert.equal(room.currentSeatId, "P2");
  submitSpeech(room, "P2", "PK 二号发言", "pk-speech-2");
  assert.equal(room.phase, "VOTE");
  assert.equal(actionAvailable(room, room.seats[0]), false);
  assert.equal(actionAvailable(room, room.seats[2]), true);
  const voteEvent = room.events.findLast(event => event.type === 'game.phase_changed');
  assert.match(publicNarration(room, voteEvent.eventId), /台下存活玩家.*P1、P2.*再次平票/);
}
{
  const room = setup();
  firstTie(room);
  pkSpeeches(room);
  let before = structuredClone(room);
  assert.throws(
    () => submitVote(room, "P1", "P2", "candidate-vote"),
    /candidates cannot vote/,
  );
  assert.deepEqual(room, before);
  assert.throws(
    () => submitVote(room, "P3", "P4", "wrong-target"),
    /target a candidate/,
  );
  assert.deepEqual(room, before);
  submitVote(room, "P3", "P1", "pk-3");
  before = structuredClone(room);
  assert.throws(
    () => submitVote(room, "P3", "P2", "pk-repeat"),
    /already voted/,
  );
  assert.deepEqual(room, before);
  assert.deepEqual(publicState(room).submittedVoteSeatIds, ["P3"]);
  assert.equal(
    publicState(room).voteResolutions.length,
    1,
    "pending PK ballots are not public",
  );
  for (const seat of room.seats.slice(3, 8))
    submitVote(room, seat.seatId, "P1", "pk-" + seat.seatId);
  assert.equal(room.seats[0].alive, false);
  assert.equal(room.voteResolutions[1].pk, true);
  assert.equal(room.phase, "LAST_WORDS");
  skipLastWords(room, "P1", "skip-pk-lastwords", room.lastWords.windowId);
  assert.equal(room.phase, "NIGHT_WOLF");
  assert.equal(room.round, 1);
  assert.equal(room.pk, null);
}
{
  const room = setup();
  firstTie(room);
  pkSpeeches(room);
  room.seats
    .slice(2, 8)
    .forEach((seat, i) =>
      submitVote(room, seat.seatId, i % 2 ? "P1" : "P2", "tie-pk-" + i),
    );
  assert.equal(room.voteResolutions.length, 2);
  assert.equal(room.voteResolutions[1].eliminatedSeatId, null);
  assert.equal(room.phase, "NIGHT_WOLF");
  assert.equal(room.round, 1);
  assert.equal(room.pk, null);
  assert.equal(room.seats.filter((s) => s.alive).length, 8);
}
{
  const room = setup();
  firstTie(room);
  pkSpeeches(room);
  assert.equal(
    defaultTurn(room, room.seats[0]),
    false,
    "candidate rule bot must wait",
  );
  assert.equal(
    defaultTurn(room, room.seats[2]),
    true,
    "rule bot must cast its second vote",
  );
  assert.equal(room.votes.at(-1).pk, true);
  assert.ok(["P1", "P2"].includes(room.votes.at(-1).targetSeatId));
}
{
  const room = setup();
  room.phase = "SPEECH";
  room.currentSeatId = "P1";
  tickHumanSpeech(room, 1000);
  tickHumanSpeech(room, 31000);
  assert.equal(
    room.actions.at(-1).actionId,
    `speech_timeout_${room.gameId}_0_P1`,
  );
  room.phase = "VOTE";
  firstTie(room);
  tickHumanSpeech(room, 32000);
  assert.equal(room.speechClock.expiresAt, 62000);
  tickHumanSpeech(room, 62000);
  assert.equal(room.currentSeatId, "P2");
  assert.equal(
    room.actions.at(-1).actionId,
    `speech_timeout_${room.gameId}_0_P1_pk`,
  );
}
{
  const room = setup();
  room.seats[8].alive = true;
  room.seats.forEach((seat, i) =>
    submitVote(room, seat.seatId, room.seats[i].seatId, "all-tied-" + i),
  );
  assert.equal(room.pk.candidates.length, 9);
  for (const seat of room.seats)
    submitSpeech(room, seat.seatId, "PK 发言", "all-speech-" + seat.seatId);
  assert.equal(
    room.phase,
    "NIGHT_WOLF",
    "no eligible PK voters must not deadlock",
  );
}
console.log(
  "PK: candidate speeches, second votes, privacy, rejection, tie, bot and timeout passed",
);
