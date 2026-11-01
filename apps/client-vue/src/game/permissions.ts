import type {
  PrivateState,
  Role,
  RoomPublicState,
} from "../../../../packages/protocol/src/types";

export function playerAction(
  state: RoomPublicState | null,
  mine: PrivateState | null,
) {
  const seat = state?.seats.find((item) => item.seatId === mine?.seatId);
  if (
    !state ||
    !mine ||
    seat?.controlSource !== "human" ||
    state.preparing ||
    state.phase === "GAME_OVER"
  )
    return null;
  if (mine.canAct === false) return null;
  if (mine.hunterAction) return "hunter";
  if (
    mine.lastWords?.status === "open" &&
    mine.lastWords.seatId === mine.seatId
  )
    return "lastwords";
  if (!mine.alive) return null;
  if (
    state.phase === "SPEECH" &&
    state.currentSeatId === mine.seatId &&
    !state.speechPlayback
  )
    return "speech";
  if (
    state.phase === "VOTE" &&
    !state.submittedVoteSeatIds.includes(mine.seatId) &&
    !(state.pk?.stage === "vote" && state.pk.candidates.includes(mine.seatId))
  )
    return "vote";
  if (state.phase === "NIGHT_WOLF" && mine.role === "werewolf") return "skill";
  if (state.phase === "NIGHT_SEER" && mine.role === "seer") return "skill";
  if (state.phase === "NIGHT_WITCH" && mine.role === "witch") return "skill";
  return null;
}

export function legalTargets(
  state: RoomPublicState | null,
  mine: PrivateState | null,
  action: ReturnType<typeof playerAction>,
) {
  if (!state || !mine || !action) return [];
  return state.seats.filter((seat) => {
    if (!seat.alive) return false;
    if (action === "vote")
      return (
        state.pk?.stage !== "vote" || state.pk.candidates.includes(seat.seatId)
      );
    if (action === "hunter")
      return mine.hunterAction?.targetSeatIds?.includes(seat.seatId) ?? true;
    if (action === "skill" && mine.role === "werewolf")
      return (
        seat.seatId !== mine.seatId &&
        !mine.werewolfTeammates?.includes(seat.seatId) &&
        (!mine.wolfProposal || mine.wolfProposal === seat.seatId)
      );
    return action === "skill";
  });
}

export function visibleRole(
  seatId: string,
  mine: PrivateState | null,
  identityOpen: boolean,
): Role | null {
  if (!identityOpen || !mine) return null;
  if (mine.seatId === seatId) return mine.role;
  return mine.role === "werewolf" && mine.werewolfTeammates?.includes(seatId)
    ? "werewolf"
    : null;
}
