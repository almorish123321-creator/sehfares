// ============================================================
// Inquiry API — wired to THIS app's own backend
// ------------------------------------------------------------
// The source design called an external service
// (sickleave-miniapp.online). Here the very same UI is served by
// our own POST /api/inquiry, so the page works self-contained.
// ============================================================

const API_CONFIG = {
    baseURL: '',                       // same origin
    endpoints: {
        inquiry: '/api/inquiry'
    }
};

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> ASCII
function toEnglishDigits(value) {
    return String(value == null ? '' : value)
        .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .trim();
}

// Function to make HTTP requests
async function makeRequest(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
        throw new Error(data.error || data.message || 'حدث خطأ في الطلب');
    }

    return data;
}

// Fetch a sick-leave record through our own inquiry endpoint
async function fetchLeaveData(recordId, idNumber) {
    const result = await makeRequest(API_CONFIG.baseURL + API_CONFIG.endpoints.inquiry, {
        method: 'POST',
        body: JSON.stringify({
            leaveId: recordId,
            serviceCode: recordId,
            nationalId: idNumber
        })
    });

    if (!result || !result.report) return null;

    const r = result.report;
    // Normalise the backend shape to what this page renders
    return {
        name: r.name || r.patientName || '',
        companionName: r.companionName || '',
        relation: r.relation || '',
        report_date: r.issueDate || '',
        entry_date: r.startDate || '',
        exit_date: r.endDate || '',
        days: r.duration || '',
        doctor: r.doctorName || '',
        job_title: r.jobTitle || ''
    };
}

// Shared error markup (matches the source design)
function errorMarkup(text) {
    return `
  <p style="
    background: #ffc3c3ff;
    color:#4c0b14;
    border:1px solid #ea5050ff;
    border-radius:7px;
    padding:18px 22px;
    text-align:center;
    font-weight:600;
    line-height:1.6;
    margin:12px 0;
    box-shadow:0 1px 2px rgba(0,0,0,.04);
    direction:rtl;
  ">
   ${text}
  </p>
`;
}

// Handle leave check form submission
async function handleCheckLeave(event) {
    event.preventDefault();

    const leaveNumber = toEnglishDigits(document.getElementById("leaveNumber").value);
    const idNumber = toEnglishDigits(document.getElementById("idNumber").value);
    const resultDiv = document.getElementById("result");
    const notFound = document.getElementById("notFound");
    const submitButton = document.getElementById("submitButton");

    resultDiv.innerHTML = "";
    notFound.innerHTML = "";

    if (!leaveNumber || !idNumber) {
        notFound.innerHTML = errorMarkup('ادخل رمز الخدمة ورقم الهوية.');
        return;
    }

    try {
        submitButton.classList.add("loading");
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span><span></span><span></span></span>استعلام';

        const leaveRecord = await fetchLeaveData(leaveNumber, idNumber);

        submitButton.classList.remove("loading");
        submitButton.disabled = false;
        submitButton.innerHTML = 'استعلام';

        if (!leaveRecord) {
            notFound.innerHTML = errorMarkup('رقم الهوية خاطئ');
            return;
        }

        resultDiv.innerHTML = `
            <div class="result-box">
                <p>الاسم:<br> <span>${leaveRecord.name}</span></p>
                ${(leaveRecord.companionName && leaveRecord.companionName !== 'null') ? `
                <p>اسم المرافق:<br> <span>${leaveRecord.companionName}</span></p>
                <p>صلة القرابة:<br> <span>${leaveRecord.relation || ''}</span></p>
                ` : ''}
                <p>تاريخ إصدار تقرير الإجازة: <br><span>${leaveRecord.report_date}</span></p>
                <p>تبدأ من: <br><span>${leaveRecord.entry_date}</span></p>
                <p>وحتى:<br> <span>${leaveRecord.exit_date}</span></p>
                <p>المدة بالأيام: <br><span>${leaveRecord.days}</span></p>
                <p>اسم الطبيب: <br><span>${leaveRecord.doctor}</span></p>
                <p>المسمى الوظيفي:<br> <span>${leaveRecord.job_title}</span></p>
            </div>
        `;

        submitButton.textContent = "استعلام جديد";
        submitButton.removeEventListener("click", handleCheckLeave);
        submitButton.addEventListener("click", resetForm);
    } catch (error) {
        submitButton.classList.remove("loading");
        submitButton.disabled = false;
        submitButton.innerHTML = 'استعلام';
        console.error("❌ Error:", error);
        // Show the backend's own message when it has one (e.g. mismatched id)
        notFound.innerHTML = errorMarkup(error.message || 'رقم الهوية خاطئ');
    }
}

// Function to reset the form
function resetForm(event) {
    event.preventDefault();

    const resultDiv = document.getElementById("result");
    const notFound = document.getElementById("notFound");
    const submitButton = document.getElementById("submitButton");
    const leaveNumberInput = document.getElementById("leaveNumber");
    const idNumberInput = document.getElementById("idNumber");

    leaveNumberInput.value = "";
    idNumberInput.value = "";
    resultDiv.innerHTML = "";
    notFound.innerHTML = "";

    submitButton.textContent = "استعلام";
    submitButton.removeEventListener("click", resetForm);
    submitButton.addEventListener("click", handleCheckLeave);

    leaveNumberInput.focus();
}
