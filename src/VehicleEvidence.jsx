import { useEffect, useRef, useState } from 'react';
import { deleteEvidence, loadEvidence, saveEvidence } from './evidenceStore';
import './VehicleEvidence.css';

const SHOTS = [
  { id: 'overview', label: 'Whole vehicle', guidance: 'Stand somewhere safe and fit the whole vehicle in the frame.' },
  { id: 'plate', label: 'Number plate', guidance: 'Show the number plate clearly, with part of the vehicle visible.' },
  { id: 'damage', label: 'Damage close-up', guidance: 'Move closer to show the damaged area in good light.' },
  { id: 'angle', label: 'Another angle', guidance: 'Show the damage from a different angle, with surrounding panels visible.' },
];
const PAIR_MS = 60_000;
const SESSION_MS = 10 * 60_000;
const dateTime = value => new Date(value).toLocaleString('en-ZA');

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser does not support location. Try a supported browser on your phone.'));
    navigator.geolocation.getCurrentPosition(position => resolve({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMetres: position.coords.accuracy,
      measuredAt: new Date(position.timestamp).toISOString(),
    }), error => reject(new Error(error.code === 1
      ? 'Location permission was denied. Allow location in your browser settings, then try again.'
      : error.code === 3 ? 'Location took too long. Move somewhere with a better signal and try again.'
        : 'Your location is unavailable. Check location services and try again.')),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 });
  });
}

function cameraMessage(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Camera permission was denied. Allow camera access in your browser settings, then retry.';
  if (error.name === 'NotFoundError') return 'No camera was found. Open this claim on a phone or a device with a camera.';
  if (error.name === 'NotReadableError') return 'The camera is busy or unavailable. Close other apps using it, then retry.';
  return 'Could not start this camera. Retry, or choose the available device camera below.';
}

function EvidencePair({ pair }) {
  return <article className="evidence-pair">
    <div className="evidence-pair-images"><figure><img src={pair.scene.image} alt={`${pair.label} captured for this claim`} /><figcaption>{pair.label}</figcaption></figure><figure><img src={pair.selfie.image} alt={`Selfie paired with ${pair.label.toLowerCase()}`} /><figcaption>Paired selfie</figcaption></figure></div>
    <div className="evidence-pair-meta"><strong>{Math.round(pair.intervalMs / 1000)}s between photos</strong><span>{dateTime(pair.scene.capturedAt)}</span><span>Location accuracy: scene ±{Math.round(pair.scene.location.accuracyMetres)} m · selfie ±{Math.round(pair.selfie.location.accuracyMetres)} m</span></div>
    <details><summary>Capture details</summary>{[['Scene', pair.scene], ['Selfie', pair.selfie]].map(([label, photo]) => <div className="evidence-capture-details" key={label}><strong>{label} · {dateTime(photo.capturedAt)}</strong><span>{photo.location.latitude.toFixed(5)}, {photo.location.longitude.toFixed(5)} · ±{Math.round(photo.location.accuracyMetres)} m</span><span>Location measured: {dateTime(photo.location.measuredAt)}</span><span>{photo.width} × {photo.height} · Camera reported: {photo.reportedFacing || 'unspecified'}</span></div>)}</details>
  </article>;
}

export default function VehicleEvidence({ claimId, customerId, readOnly = false, onEvidenceChange }) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState('intro');
  const [session, setSession] = useState(null);
  const [pairs, setPairs] = useState([]);
  const [scene, setScene] = useState(null);
  const [pendingPair, setPendingPair] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [useAvailableCamera, setUseAvailableCamera] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mounted = useRef(false);
  const operation = useRef(0);
  const sessionClock = useRef(0);
  const sceneClock = useRef(0);
  const captureLock = useRef(false);
  const onEvidenceChangeRef = useRef(onEvidenceChange);
  const isCapturing = phase === 'rear' || phase === 'selfie';
  const shot = SHOTS[pairs.length];

  useEffect(() => { onEvidenceChangeRef.current = onEvidenceChange; }, [onEvidenceChange]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    loadEvidence(customerId, claimId).then(record => {
      if (!cancelled) { setSaved(record || null); setLoading(false); onEvidenceChangeRef.current(Boolean(record)); }
    }).catch(() => {
      if (!cancelled) { setError('Could not read saved evidence. Refresh to retry; existing evidence has not been changed.'); setLoading(false); setPhase('storage-error'); }
    });
    return () => { cancelled = true; mounted.current = false; operation.current += 1; };
  }, [customerId, claimId]);

  useEffect(() => {
    if (!isCapturing) return;
    let cancelled = false;
    let ownedStream;
    const video = videoRef.current;
    async function openCamera() {
      try {
        const facing = phase === 'selfie' ? 'user' : 'environment';
        ownedStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          width: { ideal: 1280 }, height: { ideal: 960 },
          ...(useAvailableCamera ? {} : { facingMode: { exact: facing } }),
        } });
        if (cancelled) { ownedStream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = ownedStream;
        video.srcObject = ownedStream;
        await video.play();
        if (!cancelled) setCameraReady(true);
      } catch (failure) {
        ownedStream?.getTracks().forEach(track => track.stop());
        if (!cancelled) { setError(cameraMessage(failure)); setCameraReady(false); }
      }
    }
    openCamera();
    function interrupt() {
      if (document.visibilityState !== 'hidden') return;
      operation.current += 1;
      ownedStream?.getTracks().forEach(track => track.stop());
      setCameraReady(false); setScene(null); setBusy(false); setPhase('paused');
      setError('Capture paused because you left the page. Resume to retake this photo and its selfie.');
    }
    document.addEventListener('visibilitychange', interrupt);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', interrupt);
      ownedStream?.getTracks().forEach(track => track.stop());
      if (streamRef.current === ownedStream) streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [isCapturing, phase, cameraAttempt, useAvailableCamera]);

  useEffect(() => {
    if (!session || !['rear', 'selfie', 'pair-review', 'paused'].includes(phase)) return;
    const timer = setInterval(() => {
      if (performance.now() - sessionClock.current >= SESSION_MS) {
        operation.current += 1;
        setBusy(false); setCameraReady(false); setScene(null); setPendingPair(null); setPhase('expired');
        setError('This 10-minute capture session expired. Start a new session to collect a fresh set.');
      } else if (phase === 'selfie') {
        const left = Math.max(0, Math.ceil((PAIR_MS - (performance.now() - sceneClock.current)) / 1000));
        setRemaining(left);
        if (!left) {
          operation.current += 1;
          setBusy(false); setCameraReady(false); setScene(null); setPhase('paused');
          setError('The 60-second selfie window expired. Retake this photo pair.');
        }
      }
    }, 250);
    return () => clearInterval(timer);
  }, [session, phase]);

  function resetDraft() {
    operation.current += 1;
    setPairs([]); setScene(null); setPendingPair(null); setSession(null); setError('');
    setCameraReady(false); setBusy(false); setPhase('intro'); setConsent(false); setUseAvailableCamera(false);
  }

  async function start() {
    if (!consent || captureLock.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs HTTPS or localhost and a supported browser. On a phone, use an HTTPS address.'); return;
    }
    captureLock.current = true;
    const currentOperation = ++operation.current;
    setBusy(true); setError('');
    try {
      await locate();
      if (!mounted.current || operation.current !== currentOperation) return;
      sessionClock.current = performance.now();
      setSession({ id: crypto.randomUUID(), startedAt: new Date().toISOString() });
      setPairs([]); setScene(null); setPendingPair(null); setCameraReady(false); setPhase('rear');
    } catch (failure) {
      if (mounted.current && operation.current === currentOperation) setError(failure.message);
    } finally {
      captureLock.current = false;
      if (mounted.current && operation.current === currentOperation) setBusy(false);
    }
  }

  async function capture() {
    if (captureLock.current || !cameraReady) return;
    captureLock.current = true;
    const currentOperation = ++operation.current;
    setBusy(true); setError('');
    try {
      const location = await locate();
      if (!mounted.current || operation.current !== currentOperation) return;
      const now = performance.now();
      if (now - sessionClock.current >= SESSION_MS) throw new Error('Session expired. Cancel and start a fresh capture session.');
      if (phase === 'selfie' && now - sceneClock.current >= PAIR_MS) throw new Error('Selfie window expired. Retake this pair.');
      const video = videoRef.current;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!video?.videoWidth || video.readyState < 2 || track?.readyState !== 'live') throw new Error('The camera is not ready. Retry the camera before capturing.');
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const photo = {
        image: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height,
        capturedAt: new Date().toISOString(), location,
        requestedFacing: phase === 'selfie' ? 'user' : 'environment',
        reportedFacing: track.getSettings().facingMode || null,
        source: 'browser-camera',
      };
      setCameraReady(false);
      if (phase === 'rear') {
        sceneClock.current = now; setScene(photo); setRemaining(60); setPhase('selfie');
      } else {
        setPendingPair({ id: shot.id, label: shot.label, scene, selfie: photo, intervalMs: now - sceneClock.current });
        setScene(null); setPhase('pair-review');
      }
    } catch (failure) {
      if (mounted.current && operation.current === currentOperation) setError(failure.message);
    } finally {
      captureLock.current = false;
      if (mounted.current && operation.current === currentOperation) setBusy(false);
    }
  }

  function acceptPair() {
    const next = [...pairs, pendingPair];
    setPairs(next); setPendingPair(null); setCameraReady(false); setError('');
    setPhase(next.length === SHOTS.length ? 'review' : 'rear');
  }

  async function persist() {
    if (captureLock.current || pairs.length !== SHOTS.length) return;
    captureLock.current = true; setBusy(true); setError('');
    const record = { ...session, claimId, customerId, pairs, savedAt: new Date().toISOString(), verificationStatus: 'pending', captureMode: 'sequential-pairs', storage: 'browser-only' };
    try {
      await saveEvidence(record);
      if (!mounted.current) return;
      setSaved(record); resetDraft(); onEvidenceChange(true);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      captureLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function remove() {
    if (captureLock.current) return;
    captureLock.current = true; setBusy(true); setError('');
    try {
      await deleteEvidence(customerId, claimId);
      if (!mounted.current) return;
      setSaved(null); setConfirmDelete(false); onEvidenceChange(false);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      captureLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <section id="vehicle-evidence" className="panel vehicle-evidence" aria-label="Live vehicle evidence">
    <div className="evidence-heading"><div><span className="overline">VEHICLE CLAIM · LIVE CAPTURE</span><h2>Capture the scene. Tell your story.</h2><p>Four vehicle photos, each paired with a fresh selfie.</p></div><span className="evidence-status">{saved ? 'Verification pending' : 'Camera capture'}</span></div>
    <div className="evidence-notice"><strong>Your safety comes first.</strong> Only capture when it is safe. You can submit a claim now and return later, or contact support if you cannot use the camera or location.</div>
    {loading ? <p role="status">Loading evidence from this browser…</p> : <>
      {error && <div className="evidence-error" role="alert">{error}</div>}
      {saved && phase === 'intro' ? <>
        <div className="evidence-saved-heading"><div><h3>Evidence saved on this device</h3><p>{saved.pairs.length} photo pairs · {dateTime(saved.savedAt)}</p></div><span className="evidence-status">AI checks not run</span></div>
        <p className="evidence-description">These photos and location readings are stored only in this browser. Nothing has been sent to an insurer. Identity, liveness, image authenticity and duplicates have not been verified.</p>
        <div className="evidence-gallery">{saved.pairs.map(pair => <EvidencePair key={pair.id} pair={pair} />)}</div>
        <details className="evidence-session"><summary>Session details</summary><p>Browser session: {saved.id}</p><p>Started: {dateTime(saved.startedAt)} · Saved: {dateTime(saved.savedAt)}</p><p>Front and rear photos were taken sequentially. Times and location are device-reported and are not independently verified.</p></details>
        {!readOnly && <div className="evidence-actions">{confirmDelete ? <><span>Delete these photos and location readings from this browser?</span><button className="outline-btn" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep evidence</button><button className="outline-btn evidence-delete" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete evidence'}</button></> : <button className="outline-btn" onClick={() => setConfirmDelete(true)}>Delete local evidence</button>}</div>}
      </> : readOnly ? <p className="evidence-description">No evidence is available in this browser for this claim. Capture is available from the customer profile.</p> : <>
        {phase === 'intro' && <>
          <div className="evidence-guide">{SHOTS.map((item, i) => <div key={item.id}><span>{i + 1}</span><strong>{item.label}</strong><small>+ paired selfie</small></div>)}</div>
          <p className="evidence-description">Use the camera here to take each vehicle photo, then a selfie within 60 seconds. Allow camera and precise location access. The session lasts 10 minutes; each photo records a fresh location reading and its accuracy.</p>
          <p className="evidence-description">Prototype: photos, selfies and location stay in this browser until you delete them or clear site data. Use test scenes and avoid sensitive details. Gallery selection is unavailable. AI verification and insurer submission are not connected.</p>
          <label className="evidence-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>I agree to use my camera and location and store these photos and location readings on this device for this demo claim.</span></label>
          <button className="purple-btn" disabled={!consent || busy} onClick={start}>{busy ? 'Checking location…' : 'Start live capture →'}</button>
        </>}
        {session && phase !== 'intro' && <>
          <div className="evidence-progress" aria-label={`${pairs.length} of 4 photo pairs complete`}>{SHOTS.map((item, i) => <span key={item.id} className={i < pairs.length ? 'complete' : i === pairs.length ? 'current' : ''}>{i < pairs.length ? '✓' : i + 1} <span>{item.label}</span></span>)}</div>
          {isCapturing && <>
            <div className="evidence-capture-heading"><div><h3>{phase === 'selfie' ? 'Now take your paired selfie' : shot.label}</h3><p>{phase === 'selfie' ? 'Keep your face clearly visible. This photo is paired with the vehicle photo you just took.' : shot.guidance}</p></div>{phase === 'selfie' && <span className="evidence-timer" role="timer">{remaining}s left</span>}</div>
            <div className={`evidence-viewfinder ${phase === 'selfie' ? 'selfie' : ''}`}><video ref={videoRef} autoPlay muted playsInline aria-label={phase === 'selfie' ? 'Selfie camera preview' : 'Vehicle camera preview'} /><span className="evidence-camera-label">{phase === 'selfie' ? 'SELFIE' : 'VEHICLE'} · {cameraReady ? 'CAMERA OPEN' : 'STARTING CAMERA'}</span>{scene && phase === 'selfie' && <img className="evidence-scene-inset" src={scene.image} alt="Vehicle photo to pair with this selfie" />}</div>
            <div className="evidence-camera-help"><span>{useAvailableCamera ? 'Using the available device camera. Check the preview before taking each photo.' : `${phase === 'selfie' ? 'Front' : 'Rear'} camera requested. Photos are taken one after the other.`}</span></div>
            <div className="evidence-actions"><button className="purple-btn" disabled={!cameraReady || busy} onClick={capture}>{busy ? 'Getting fresh location…' : phase === 'selfie' ? 'Take paired selfie' : 'Take vehicle photo'}</button><button className="outline-btn" disabled={busy} onClick={() => { setCameraReady(false); setError(''); setCameraAttempt(n => n + 1); }}>Retry camera</button>{!cameraReady && !busy && <button className="outline-btn" onClick={() => { setCameraReady(false); setError(''); setUseAvailableCamera(true); setCameraAttempt(n => n + 1); }}>Use available device camera</button>}</div>
          </>}
          {phase === 'pair-review' && pendingPair && <><h3>Check this photo pair</h3><EvidencePair pair={pendingPair} /><div className="evidence-actions"><button className="purple-btn" onClick={acceptPair}>{pairs.length === SHOTS.length - 1 ? 'Review all evidence →' : 'Keep pair & continue →'}</button><button className="outline-btn" onClick={() => { setPendingPair(null); setCameraReady(false); setError(''); setPhase('rear'); }}>Retake this pair</button></div></>}
          {phase === 'review' && <><h3>Review your evidence</h3><p className="evidence-description">Check that each vehicle photo and selfie is clear. Saving records capture evidence only; it does not verify or approve your claim.</p><div className="evidence-gallery">{pairs.map(pair => <EvidencePair key={pair.id} pair={pair} />)}</div><div className="evidence-actions"><button className="purple-btn" disabled={busy} onClick={persist}>{busy ? 'Saving…' : 'Save evidence on this device'}</button></div></>}
          {phase === 'paused' && <button className="purple-btn" disabled={busy} onClick={() => { setError(''); setCameraReady(false); setPhase('rear'); }}>Resume & retake pair</button>}
          {phase === 'expired' && <button className="purple-btn" onClick={resetDraft}>Start again</button>}
          <button className="evidence-cancel" disabled={busy} onClick={resetDraft}>Cancel & discard unsaved capture</button>
          <p className="evidence-description">Unsaved photos are discarded if you leave this claim. No liveness or AI checks run in this prototype.</p>
        </>}
      </>}
    </>}
  </section>;
}
