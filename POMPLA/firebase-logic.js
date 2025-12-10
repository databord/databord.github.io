// 1. IMPORTACIONES DESDE LA WEB (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 2. TU CONFIGURACIÓN
const firebaseConfig = {
    apiKey: "AIzaSyBycm4N9nCTrsajbmt3VoWeoc62IP0usn4",
    authDomain: "plannerpomodoro-naxi.firebaseapp.com",
    projectId: "plannerpomodoro-naxi",
    storageBucket: "plannerpomodoro-naxi.firebasestorage.app",
    messagingSenderId: "107249559788",
    appId: "1:107249559788:web:90cd3e4f35f0fcbfd65dc9",
    measurementId: "G-6Z7YW2JHTY"
};

// 3. INICIALIZAR APP
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TASK_COLLECTION = "tasks";
const USER_EMAIL = "yo@plannerpomodoronaxi.com";
const USER_PASS = "POMO.DORO.PRUEBA.PIMBA";

// 4. AUTOLOGIN
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("🟢 Conectado a Firebase como:", user.uid);
        iniciarSincronizacion(user.uid);
    } else {
        console.log("🔴 Conectando a Firebase...");
        signInWithEmailAndPassword(auth, USER_EMAIL, USER_PASS)
            .catch((error) => console.error("Error login:", error));
    }
});

// 5. SINCRONIZACIÓN
function iniciarSincronizacion(uid) {
    const q = query(
        collection(db, TASK_COLLECTION),
        where("uid", "==", uid),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        const tareas = [];
        snapshot.forEach((doc) => {
            tareas.push({ id: doc.id, ...doc.data() });
        });

        // PUENTE HACIA TU SCRIPT.JS
        if (window.recibirTareasDeFirebase) {
            console.log("🔄 Recibidas", tareas.length, "tareas de la nube.");
            window.recibirTareasDeFirebase(tareas);
        } else {
            console.warn("Script.js aún no está listo para recibir tareas.");
        }
    });
}

// 6. FUNCIONES GLOBALES PARA USAR EN SCRIPT.JS

window.addTaskToFirebase = async (taskObj) => {
    try {
        const user = auth.currentUser;
        if (!user) return;

        // Limpiamos el objeto para no guardar 'undefined' si algo falta
        const dataToSave = {
            uid: user.uid,
            title: taskObj.title,
            desc: taskObj.desc || "",
            date: taskObj.date || "",
            priority: taskObj.priority || "medium",
            parentId: taskObj.parentId || "",
            category: taskObj.category || "General",
            icon: taskObj.icon || "",
            pomodoroSettings: taskObj.pomodoroSettings || { cycles: 1, work: 25, break: 5 },
            status: taskObj.status || "pending",
            pomodoros: taskObj.pomodoros || 0,
            completed: taskObj.status === 'completed', // Campo auxiliar útil
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, TASK_COLLECTION), dataToSave);
    } catch (e) {
        console.error("Error guardando:", e);
        alert("Error de red al guardar tarea");
    }
};

window.updateTaskInFirebase = async (id, data) => {
    try {
        const taskRef = doc(db, TASK_COLLECTION, id);
        // Si actualizamos el status, actualizamos también 'completed'
        if (data.status) {
            data.completed = data.status === 'completed';
        }
        await updateDoc(taskRef, data);
    } catch (e) {
        console.error("Error actualizando:", e);
    }
};

window.deleteTaskFromFirebase = async (id) => {
    try {
        await deleteDoc(doc(db, TASK_COLLECTION, id));
    } catch (e) {
        console.error("Error borrando:", e);
    }
};