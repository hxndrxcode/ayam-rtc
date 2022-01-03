import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBbLknUwxMl49fK1qzpoBxaEVsDyOI3Gbw",
  authDomain: "fir-ayam-rtc.firebaseapp.com",
  projectId: "fir-ayam-rtc",
  storageBucket: "fir-ayam-rtc.appspot.com",
  messagingSenderId: "810738376246",
  appId: "1:810738376246:web:ad12db3b264298515f0297",
  test: 1
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

const vueApp = new Vue({
  el: '#root',
  data() {
    return {
      showPopUp: false,
      sessionPage: false,
      joinVideoCallID: '',
      videoCallID: '',
    }
  },
  methods: {
    async askPermission() {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      remoteStream = new MediaStream();
  
      // Push tracks from local stream to peer connection
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
      
      // Pull tracks from remote stream, add to video stream
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
      };
      
      const webcamVideo = document.getElementById('webcamVideo');
      const remoteVideo = document.getElementById('remoteVideo');
      webcamVideo.srcObject = localStream;
      remoteVideo.srcObject = remoteStream;
      
    },
    async createVC() {
      await this.askPermission()
      
      const callDoc = firestore.collection('calls').doc();
      const offerCandidates = callDoc.collection('offerCandidates');
      const answerCandidates = callDoc.collection('answerCandidates');
      
      
      // Get candidates for caller, save to db
      pc.onicecandidate = (event) => {
        event.candidate && offerCandidates.add(event.candidate.toJSON());
      };
      
      // Create offer
      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);
      
      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
      };
      
      await callDoc.set({ offer });
      
      // Listen for remote answer
      callDoc.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription);
        }
      });
      
      // When answered, add candidate to peer connection
      answerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate);
          }
        });
      });
      
      this.sessionPage = true
      this.videoCallID = callDoc.id
    },
    async joinVC() {
      await this.askPermission()
      
      const callId = this.joinVideoCallID
      const callDoc = firestore.collection('calls').doc(callId);
      const answerCandidates = callDoc.collection('answerCandidates');
      const offerCandidates = callDoc.collection('offerCandidates');
      
      pc.onicecandidate = (event) => {
        event.candidate && answerCandidates.add(event.candidate.toJSON());
      };
      
      const callData = (await callDoc.get()).data();
      
      const offerDescription = callData.offer;
      await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
      
      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);
      
      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };
      
      await callDoc.update({ answer });
      
      offerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            let data = change.doc.data();
            pc.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      
      this.sessionPage = true
      this.videoCallID = this.joinVideoCallID
      this.joinVideoCallID = ''
    },
    async closeVC() {
      const webcamVideo = document.getElementById('webcamVideo');
      const remoteVideo = document.getElementById('remoteVideo');
      await this.closeVCProccess(webcamVideo)
      await this.closeVCProccess(remoteVideo)
      this.sessionPage = false
      this.videoCallID = ''
    },
    async closeVCProccess(el) {
      const stream = el.srcObject;
      const tracks = stream.getTracks();
      
      tracks.forEach(function(track) {
        track.stop();
      });
      
      el.srcObject = null;
    }
  }
})
