import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBycm4N9nCTrsajbmt3VoWeoc62IP0usn4",
    authDomain: "plannerpomodoro-naxi.firebaseapp.com",
    projectId: "plannerpomodoro-naxi",
    storageBucket: "plannerpomodoro-naxi.firebasestorage.app",
    messagingSenderId: "107249559788",
    appId: "1:107249559788:web:90cd3e4f35f0fcbfd65dc9",
    measurementId: "G-6Z7YW2JHTY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const TASK_COLLECTION = "tasks";

let unsubscribeSnapshot = null; // Para poder detener la escucha al salir

// CONTROL DE ESTADO DE AUTENTICACIÓN
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("🟢 Usuario conectado:", user.email);

        // 1. Ocultar pantalla de login
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.classList.remove('active');

        // 2. Mostrar email en la UI
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.textContent = `Usuario: ${user.email}`;

        // 3. Cargar datos
        iniciarSincronizacion(user.uid);
    } else {
        console.log("⚪ Nadie conectado.");

        // 1. Mostrar pantalla de login
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.classList.add('active');

        // 2. Limpiar datos en UI
        if (window.recibirTareasDeFirebase) {
            window.recibirTareasDeFirebase([]);
        }

        // 3. Detener escucha de Firebase anterior si existía
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }
    }
});

function iniciarSincronizacion(uid) {
    // Detenemos escucha anterior por seguridad
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    const q = query(
        collection(db, TASK_COLLECTION),
        where("uid", "==", uid), // FILTRO CLAVE: Solo trae lo del usuario actual
        orderBy("createdAt", "desc")
    );

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const tareas = [];
        snapshot.forEach((doc) => {
            tareas.push({ id: doc.id, ...doc.data() });
        });

        if (window.recibirTareasDeFirebase) {
            window.recibirTareasDeFirebase(tareas);
        }
    }, (error) => {
        console.error("Error leyendo tareas:", error);
    });
}

// --- FUNCIONES DE AUTENTICACIÓN PARA LA UI ---

window.authLogin = async (email, password) => {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (error) {
        console.error("Error login:", error.code);
        let msg = "Error al iniciar sesión.";
        if (error.code === 'auth/invalid-credential') msg = "Correo o contraseña incorrectos.";
        if (error.code === 'auth/invalid-email') msg = "Correo inválido.";
        return { success: false, message: msg };
    }
};

window.authRegister = async (email, password) => {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (error) {
        console.error("Error registro:", error.code);
        let msg = "Error al registrarse.";
        if (error.code === 'auth/email-already-in-use') msg = "Este correo ya está registrado.";
        if (error.code === 'auth/weak-password') msg = "La contraseña debe tener al menos 6 caracteres.";
        return { success: false, message: msg };
    }
};

window.authLogout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error logout:", error);
    }
};

window.checkInvitationCode = async (code) => {
    try {
        // Assume collection is 'invitation_codes' and doc ID is the code
        const docRef = doc(db, "invitation_codes", code);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Optional: Check if code is active or has usage limit
            const data = docSnap.data();
            if (data.active === false) return { valid: false, message: "Código inactivo." };
            return { valid: true };
        } else {
            return { valid: false, message: "Código inválido." };
        }
    } catch (error) {
        console.error("Error verificando código:", error);
        return { valid: false, message: "Error verificando código. Intente más tarde." };
    }
};

window.changeUserPassword = async (oldPassword, newPassword) => {
    const user = auth.currentUser;
    if (!user) return { success: false, message: "No hay usuario autenticado." };

    try {
        // 1. Re-authenticate
        const credential = EmailAuthProvider.credential(user.email, oldPassword);
        await reauthenticateWithCredential(user, credential);

        // 2. Update Password
        await updatePassword(user, newPassword);
        return { success: true };
    } catch (error) {
        console.error("Error cambiando contraseña:", error.code);
        let msg = "Error al actualizar la contraseña.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') msg = "La contraseña actual es incorrecta.";
        if (error.code === 'auth/weak-password') msg = "La nueva contraseña es muy débil.";
        if (error.code === 'auth/requires-recent-login') msg = "Por seguridad, inicia sesión nuevamente antes de cambiar la contraseña.";
        return { success: false, message: msg };
    }
};

// --- FUNCIONES DE DATOS ---

window.addTaskToFirebase = async (taskObj) => {
    const user = auth.currentUser;
    if (!user) return; // Seguridad extra

    try {
        const dataToSave = {
            uid: user.uid, // ETIQUETA CLAVE: Marcamos la tarea como propiedad del usuario
            title: taskObj.title,
            desc: taskObj.desc || "",
            date: taskObj.date || "",
            endDate: taskObj.endDate || "",
            priority: taskObj.priority || "medium",
            recurrence: taskObj.recurrence || "none",
            recurrenceDays: taskObj.recurrenceDays || [],
            parentId: taskObj.parentId || "",
            category: taskObj.category || "General",
            icon: taskObj.icon || "",
            pomodoroSettings: taskObj.pomodoroSettings || { cycles: 1, work: 25, break: 5 },
            status: taskObj.status || "pending",
            pomodoros: taskObj.pomodoros || 0,
            completed: taskObj.status === 'completed',
            order: taskObj.order || Date.now(), // Default order to end
            sessions: taskObj.sessions || [],
            isTimelineComment: !!taskObj.isTimelineComment,
            commentType: taskObj.commentType || "",
            isFolder: !!taskObj.isFolder,
            color: taskObj.color || "",
            comment_after_end: taskObj.comment_after_end || "",
            createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, TASK_COLLECTION), dataToSave);
    } catch (e) {
        console.error("Error guardando:", e);
    }
};

window.updateTaskInFirebase = async (id, data) => {
    try {
        const taskRef = doc(db, TASK_COLLECTION, id);
        if (data.status) data.completed = data.status === 'completed';
        await updateDoc(taskRef, data);
    } catch (e) { console.error(e); }
};

window.deleteTaskFromFirebase = async (id) => {
    try {
        await deleteDoc(doc(db, TASK_COLLECTION, id));
    } catch (e) { console.error(e); }
};