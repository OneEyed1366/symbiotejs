import { useRef, useState } from 'react';
import { View, Text } from '@symbiote-native/react';
import { firstTouchX } from './event-utils';

// Responder: the gesture capabilities exposed here, shown so the grabbed
// element is the one that moves. Each chip is its OWN responder: it grabs on touch
// start and drags ITSELF (onResponderMove translates that chip). Drag a chip past a
// threshold and the surrounding strip STEALS the gesture: its onMoveShouldSetResponder
// fires once the finger has travelled far enough, the chip yields (onResponder-
// TerminationRequest -> terminate, so it snaps back) and the strip pans the whole row.
// A small drag moves the digit; a big drag hands off to the strip: move-should-set and
// transfer, each visible (and the separate "transfer" line lights on the hand-off).
// DEBUG logcat shows "responder transferred ... -> ..." at that moment.
const RESPONDER_CHIPS = [0, 1, 2, 3, 4];
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64;

export function ResponderDemo() {
  const [activeChip, setActiveChip] = useState<number | null>(null);
  const [chipDx, setChipDx] = useState(0);
  const [rowDx, setRowDx] = useState(0);
  const [status, setStatus] = useState(
    'tap a chip · drag it to move · drag far → strip steals it',
  );
  const [transfer, setTransfer] = useState('');
  const startX = useRef(0);
  const panStartX = useRef(0);
  const grabbed = useRef<number | null>(null);

  return (
    <View className="section-tight">
      <Text className="section-label">
        Responder · drag a chip vs hand-off to the strip
      </Text>
      <Text className="info-text">{status}</Text>
      {/* the separate transfer indicator, lit only when the strip steals the gesture */}
      <Text
        className="transfer-text"
        style={{ color: transfer ? '#f6ad55' : '#41506a' }}
      >
        {transfer || 'transfer: —'}
      </Text>
      <View
        // Claims the gesture only once the finger has travelled past the threshold,
        // stealing it from whichever chip currently holds it, the transfer path.
        onMoveShouldSetResponder={event =>
          grabbed.current !== null &&
          Math.abs(firstTouchX(event) - startX.current) > RESPONDER_STEAL_DX
        }
        onResponderGrant={event => {
          setTransfer(
            `↯ strip stole the gesture from chip ${grabbed.current ?? '?'}`,
          );
          setActiveChip(null);
          setChipDx(0);
          panStartX.current = firstTouchX(event);
          setStatus('strip panning');
        }}
        onResponderMove={event =>
          setRowDx(firstTouchX(event) - panStartX.current)
        }
        onResponderRelease={() => {
          setRowDx(0);
          setStatus('strip released');
        }}
        onResponderTerminate={() => setRowDx(0)}
        className="strip-box"
      >
        <View
          className="row-tight"
          style={{ transform: [{ translateX: rowDx }] }}
        >
          {RESPONDER_CHIPS.map(index => (
            <View
              key={index}
              testID={`resp-chip-${index}`}
              // Grabs on start and drags itself; yields to the strip past the threshold.
              onStartShouldSetResponder={() => true}
              onResponderGrant={event => {
                startX.current = firstTouchX(event);
                grabbed.current = index;
                setActiveChip(index);
                setChipDx(0);
                setRowDx(0);
                setTransfer('');
                setStatus(`chip ${index} grabbed`);
              }}
              onResponderMove={event => {
                const dx = firstTouchX(event) - startX.current;
                setChipDx(dx);
                setStatus(`chip ${index} moving · dx=${Math.round(dx)}`);
              }}
              onResponderTerminationRequest={() => true}
              onResponderTerminate={() => {
                setChipDx(0);
                setActiveChip(null);
              }}
              onResponderRelease={() => {
                setChipDx(0);
                setActiveChip(null);
                setStatus(`chip ${index} released`);
              }}
              className="chip"
              style={{
                borderColor: activeChip === index ? '#7fb5ff' : 'transparent',
                transform: [{ translateX: activeChip === index ? chipDx : 0 }],
              }}
            >
              <Text className="chip-text">{index}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
