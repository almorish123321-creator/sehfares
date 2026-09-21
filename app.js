const app = {
    tg: window.Telegram ? window.Telegram.WebApp : null,
    state: {
        chatId: null,
        user: null,
        points: 0,
        adminToken: null,
        subscriptionDays: 0,
        reports: [],
        currentStep: 1,
        leaveType: 'sickleave', // 'sickleave' or 'companion'
        currentReportId: null,
        hospitalLogoUrl: null, // Use default in HTML unless uploaded
        config: { ownerContact: '', ownerUsername: '' }, // loaded from /api/public-config
        testMode: false // 🧪 demo mode: fixed data + locked fields
    },

    currentDropdown: null,
    dropdownData: {
        nationality: [
            "إثيوبيا",
            "أذربيجاني",
            "أرجنتيني",
            "الأردن",
            "أرميني",
            "إريتريا",
            "إسباني",
            "أستراليا",
            "إستوني",
            "إسرائيلي",
            "إفريقي أوسطي",
            "أفغانستان",
            "إكوادوري",
            "ألباني",
            "ألماني",
            "الإمارات",
            "الولايات المتحدة",
            "أندوري",
            "إندونيسيا",
            "أنغولي",
            "أوروغواياني",
            "أوزبكي",
            "أوغندا",
            "أوكراني",
            "إيران",
            "أيرلندي",
            "أيسلندي",
            "إيطالي",
            "إيفواري",
            "بابواوي",
            "باراغواياني",
            "باربادوسي",
            "باكستان",
            "بالاوي",
            "باهامي",
            "البحرين",
            "برازيلي",
            "برتغالي",
            "بروني",
            "بريطانيا",
            "بلجيكي",
            "بلغاري",
            "بليزي",
            "بنغلاديشي",
            "بنمي",
            "بنيني",
            "بوتاني",
            "بوركيني",
            "بوروندي",
            "بوسني",
            "بولندي",
            "بوليفي",
            "بيروفي",
            "بيلاروسي",
            "تايلاندي",
            "تايواني",
            "تركمانستاني",
            "تركيا",
            "تشادي",
            "تشيكي",
            "تشيلي",
            "تنزاني",
            "توغولي",
            "تونس",
            "تيموري شرقي",
            "جامايكي",
            "الجزائر",
            "جنوب أفريقي",
            "جورجي",
            "جيبوتي",
            "دنماركي",
            "دومينيكاني",
            "رأس أخضري",
            "رواندي",
            "روسي",
            "روماني",
            "زامبي",
            "زيمبابوي",
            "ساموي",
            "سانت لوسي",
            "سريلانكا",
            "السعودية",
            "سلفادوري",
            "سلوفاكي",
            "سلوفيني",
            "سنغافوري",
            "سنغالي",
            "سوازيلندي",
            "السودان",
            "سوريا",
            "سورينامي",
            "سويدي",
            "سويسري",
            "سيراليوني",
            "سيشلي",
            "صربي",
            "الصومال",
            "صيني",
            "طاجيكي",
            "العراق",
            "عمان",
            "غابوني",
            "غامبي",
            "غاني",
            "غرينادي",
            "غواتيمالي",
            "غياني",
            "غيني",
            "غيني استوائي",
            "غيني بيساوي",
            "فرنسي",
            "الفلبين",
            "فلسطين",
            "فنزويلي",
            "فنلندي",
            "فيتنامي",
            "فيجي",
            "قبرصي",
            "قرغيزي",
            "قطر",
            "قمري",
            "كازاخستاني",
            "كاميروني",
            "كرواتي",
            "كمبودي",
            "كندا",
            "كوبي",
            "كوري جنوبي",
            "كوري شمالي",
            "كوستاريكي",
            "كولومبي",
            "كونغولي",
            "الكويت",
            "كيريباتي",
            "كينيا",
            "لاتفي",
            "لاوسي",
            "لبنان",
            "لوكسمبورغي",
            "ليبيا",
            "ليبيري",
            "ليتواني",
            "ليختنشتايني",
            "ليسوثي",
            "مالاوي",
            "مالديفي",
            "مالطي",
            "مالي",
            "ماليزي",
            "مجري",
            "مصر",
            "المغرب",
            "مقدوني",
            "مكسيكي",
            "ملغاشي",
            "منغولي",
            "موريتاني",
            "موريشيوسي",
            "موزمبيقي",
            "مولدوفي",
            "موناكوي",
            "مونتينيغري",
            "ميكرونيزي",
            "ناميبي",
            "ناوروي",
            "نمساوي",
            "نيبال",
            "نيجري",
            "نيجيري",
            "نيكاراغوي",
            "نيوزيلندي",
            "هايتي",
            "هندوراسي",
            "الهند",
            "هولندي",
            "ياباني",
            "اليمن",
            "يوناني"
        ],
        hospital: [
            "مستشفى الملك خالد بنجران",
            "مستشفى نجران العام",
            "مستشفى الولادة والأطفال بنجران",
            "مستشفى إرادة والصحة النفسية بنجران",
            "مستشفى القوات المسلحة بنجران",
            "مستشفى خباش العام",
            "مستشفى حبونا العام",
            "مستشفى شرورة العام",
            "مستشفى بدر الجنوب",
            "مستشفى ثار",
            "مستشفى يدمة العام",
            "مستشفى الملك عبدالعزيز التخصصي بالطائف",
            "مستشفى الملك فيصل بالطائف",
            "مستشفى الأطفال بالطائف",
            "مستشفى الولادة والأطفال بالطائف",
            "مستشفى القوات المسلحة بالهدا",
            "مستشفى الأمير منصور العسكري",
            "مستشفى الصحة النفسية بالطائف",
            "مستشفى النهضة العام",
            "مستشفى الملك خالد ومركز الأمير سلطان للخدمات الصحية بالخرج",
            "مستشفى الولادة والأطفال بالخرج",
            "مستشفى إرادة والصحة النفسية بالخرج",
            "مستشفى القوات المسلحة بالخرج",
            "مستشفى الملك خالد بحفر الباطن",
            "مستشفى حفر الباطن المركزي",
            "مستشفى الولادة والأطفال بحفر الباطن",
            "مستشفى الصحة النفسية بحفر الباطن",
            "مستشفى نور محمد خان",
            "مستشفى الملك فهد التخصصي ببريدة",
            "مستشفى بريدة المركزي",
            "مستشفى الملك سعود بعنيزة",
            "مستشفى الرس العام",
            "مستشفى الولادة والأطفال ببريدة",
            "مستشفى البكيرية العام",
            "مستشفى المذنب العام",
            "مستشفى عيون الجواء العام",
            "مستشفى الملك فهد بالباحة",
            "مستشفى الأمير مشاري بن سعود",
            "مستشفى بلجرشي العام",
            "مستشفى المخواة العام",
            "مستشفى قلوة العام",
            "مستشفى العقيق العام",
            "مستشفى الملك فهد المركزي بجازان",
            "مستشفى الأمير محمد بن ناصر",
            "مستشفى جازان العام",
            "مستشفى الملك عبدالله بجازان",
            "مستشفى صبيا العام",
            "مستشفى أبو عريش العام",
            "مستشفى صامطة العام",
            "مستشفى بيش العام",
            "مستشفى فرسان العام",
            "مستشفى الملك فهد بسكاكا",
            "مستشفى الأمير متعب بن عبدالعزيز",
            "مستشفى سكاكا العام",
            "مستشفى دومة الجندل العام",
            "مستشفى القريات العام",
            "مستشفى طبرجل العام",
            "مستشفى عرعر المركزي",
            "مستشفى الأمير عبدالعزيز بن مساعد",
            "مستشفى طريف العام",
            "مستشفى رفحاء العام",
            "مستشفى العويقيلة العام"
        ]
    },

    openDropdown(type) {
        this.currentDropdown = type;
        const overlay = document.getElementById('custom-select-overlay');
        const input = document.getElementById('custom-select-input');
        input.value = '';
        overlay.classList.add('active');
        this.renderDropdownList(this.dropdownData[type]);
        input.focus();
    },

    closeDropdown() {
        document.getElementById('custom-select-overlay').classList.remove('active');
        this.currentDropdown = null;
    },

    renderDropdownList(items) {
        const list = document.getElementById('custom-select-list');
        list.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'custom-select-item';
            div.innerText = item;
            div.onclick = () => {
                const targetInput = document.getElementById(this.currentDropdown === 'hospital' ? 'hospital_ar' : 'nationality');
                targetInput.value = item;
                if(this.currentDropdown === 'hospital') this.syncHospitalEn();
                this.closeDropdown();
            };
            list.appendChild(div);
        });
    },

    
    filterCustomSelect() {
        if(!this.currentDropdown) return;
        const query = document.getElementById('custom-select-input').value;
        const queryLower = query.toLowerCase();
        let filtered = this.dropdownData[this.currentDropdown].filter(item => item.toLowerCase().includes(queryLower));
        
        // Allow manual custom entry
        if (query.trim() !== '' && !filtered.includes(query.trim())) {
            filtered.unshift(query.trim());
        }
        
        this.renderDropdownList(filtered);
    },


    
    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        this.state.adminToken = urlParams.get('token');
        
        if (window.location.href.includes('screen=admin')) {
            this.navigate('admin');
            // Hide fab just in case
            document.getElementById('fab-menu').style.display = 'none';
        }

        const queryChatId = urlParams.get('chatId');
        if (this.tg) {
            this.tg.expand();
            if (this.tg.initDataUnsafe && this.tg.initDataUnsafe.user) {
                this.state.chatId = this.tg.initDataUnsafe.user.id.toString();
                this.state.user = this.tg.initDataUnsafe.user;
            } else if (queryChatId) {
                this.state.chatId = queryChatId;
            } else {
                this.state.chatId = "123456789";
            }
        } else if (queryChatId) {
            this.state.chatId = queryChatId;
        } else {
            this.state.chatId = "123456789";
        }

        // Fetch public (non-secret) configuration from the server.
        // SECURITY: this endpoint returns no tokens and no chat ids.
        try {
            const cfgRes = await fetch('/api/public-config');
            const cfg = await cfgRes.json();
            if (cfg && cfg.success) {
                this.state.config.ownerContact = cfg.ownerContact || '';
                this.state.config.ownerUsername = cfg.ownerUsername || '';

                // Wire the static "contact the owner" button (no hardcoded username in HTML)
                const contactLink = document.getElementById('owner-contact-link');
                if (contactLink && this.state.config.ownerContact) {
                    contactLink.href = this.state.config.ownerContact;
                }
            }
        } catch (e) { /* non-fatal: falls back to empty contact */ }

        await this.loadLocalData();
        this.updateDashboardUI();




        

        // Populate datalists
        const hospList = document.getElementById('hospital_list');
        if (hospList) {
            this.dropdownData.hospital.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h;
                hospList.appendChild(opt);
            });
        }
        const natList = document.getElementById('nationality_list');
        if (natList) {
            this.dropdownData.nationality.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n;
                natList.appendChild(opt);
            });
        }


        
        // Listeners for file upload
        const logoInput = document.getElementById('hospital_logo');
        if(logoInput) logoInput.addEventListener('change', (e) => this.handleLogoUpload(e));
        
        await this.loadPdfTemplate();
        
        // Sync with server asynchronously
        this.syncDataWithServer().catch(err => console.warn('Offline mode active', err));
    },

    async loadLocalData() {
        if (!this.state.chatId) return;
        try {
            const raw = localStorage.getItem('cached_user_' + this.state.chatId);
            if (raw) {
                const cached = JSON.parse(raw);
                this.state.points = cached.points || 0;
                this.state.subscriptionDays = cached.subscriptionDays || 0;
                this.updateDashboardUI();
            }
        } catch (e) {
            console.log('No cached local data found');
        }
    },

    async fetchAsBase64(url) {
        if (!url || url.startsWith('data:')) return url;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to fetch image as base64:", e);
            return url;
        }
    },

    async syncDataWithServer() {
        if (!this.state.chatId) return;
        try {
            const res = await fetch(`/api/user/${this.state.chatId}`, {
                headers: { 'Cache-Control': 'no-cache' }
            });
            if (res.ok) {
                const data = await res.json();
                const u = data.user || {};
                this.state.points = u.points != null ? u.points : (data.points || 0);
                this.state.subscriptionDays = u.daysRemaining != null ? u.daysRemaining : (u.subscriptionDays || 0);
                this.state.status = u.status || 'active';
                this.state.plan = u.plan || 'points';
                this.state.report_payment_source = u.report_payment_source || 'points';
                if (u.mohLogo) this.state.mohLogoUrl = u.mohLogo;
                if (u.hospitalLogo) this.state.hospitalLogoUrl = u.hospitalLogo;

                // Cache locally for offline resiliency
                try {
                    localStorage.setItem('cached_user_' + this.state.chatId, JSON.stringify({
                        points: this.state.points,
                        subscriptionDays: this.state.subscriptionDays,
                        status: this.state.status
                    }));
                } catch (e) {}

                // Fetch user reports from isolated API
                try {
                    const repRes = await fetch(`/api/user/${this.state.chatId}/reports`, {
                        headers: { 'Cache-Control': 'no-cache' }
                    });
                    if (repRes.ok) {
                        const repData = await repRes.json();
                        if (repData.success && Array.isArray(repData.reports)) {
                            this.state.reports = repData.reports;
                            this.renderReports();
                        }
                    }
                } catch (repErr) {
                    console.warn('Reports fetch error:', repErr.message);
                }

                this.updateDashboardUI();
            }
        } catch (err) {
            console.warn('Sync with server offline/error:', err.message);
            // Fallback to local cache if offline
            try {
                const raw = localStorage.getItem('cached_user_' + this.state.chatId);
                if (raw) {
                    const cached = JSON.parse(raw);
                    this.state.points = cached.points || 0;
                    this.state.subscriptionDays = cached.subscriptionDays || 0;
                    this.updateDashboardUI();
                }
            } catch (e) {}
        }
    },

    updateDashboardUI() {
        document.getElementById('points-balance-display').innerText = this.state.points;
        const subBadge = document.getElementById('sub-status-badge');
        if (this.state.subscriptionDays > 0) {
            subBadge.innerText = `اشتراك لامحدود - متبقي ${this.state.subscriptionDays} يوم`;
            subBadge.style.color = '#009688';
        } else if (this.state.points >= 5) {
            subBadge.innerText = `اشتراك بالنقاط - متبقي ${Math.floor(this.state.points / 5)} تقرير`;
            subBadge.style.color = '#009688';
        } else {
            subBadge.innerText = 'لا يوجد اشتراك فعال';
            subBadge.style.color = '#e74c3c';
        }
        
        this.renderReports(this.state.reports);
    },

    searchReports() {
        const term = (document.getElementById('report-search')?.value || '').toLowerCase().trim();
        const list = this.state.reports || [];
        if (!term) {
            this.renderReports(list);
            return;
        }
        const filtered = list.filter(r => {
            const data = r.data || {};
            const name = (r.patient_name || r.patientName || data.patient_name_ar || "").toLowerCase();
            const nid = (r.national_id || data.national_id || "").toLowerCase();
            const id = (r.id || r.report_id || r.service_code || "").toLowerCase();
            return name.includes(term) || nid.includes(term) || id.includes(term);
        });
        this.renderReports(filtered);
    },

    renderReports(reportsToRender) {
        const reportsList = document.getElementById('reports-list');
        if (!reportsList) return;
        reportsList.innerHTML = '';
        const list = reportsToRender || this.state.reports || [];
        if (list.length === 0) {
            reportsList.innerHTML = '<p style="text-align:center; color:#777; margin-top:30px;">لا توجد تقارير في سجلك حتى الآن</p>';
        } else {
            list.forEach(r => {
                const card = document.createElement('div');
                card.className = 'report-card';
                const pName = r.patient_name || r.patientName || (r.data && (r.data.patient_name_ar || r.data.patient_name_en)) || 'مريض';
                const repDate = r.issue_date || r.issueDate || (r.data && r.data.issue_date) || '';
                const repId = r.id || r.report_id || r.service_code || '';
                const shortUrl = r.inquiry_url || r.short_url || r.shortURL || '';
                const typeLabel = r.type === 'companion' ? 'مرافقة مريض' : (r.type === 'companion_review' ? 'مشهد مراجعة لمرافق' : 'إجازة مرضية');

                card.innerHTML = `
                    <div class="report-info">
                        <h4>${pName}</h4>
                        <p>${typeLabel} • ${repDate}</p>
                        <span style="font-size:11px; color:#00a896; font-family:monospace; font-weight:bold;">${repId}</span>
                    </div>
                    <div class="report-actions" style="display:flex; gap:6px;">
                        ${shortUrl ? `<button type="button" onclick="window.open('${shortUrl}', '_blank')" title="رابط الاستعلام" style="padding:6px 10px; font-size:13px; background:#e0f2fe; border:1px solid #7dd3fc; border-radius:6px; cursor:pointer;">🔗</button>` : ''}
                        <button type="button" onclick="app.copyReportId('${repId}')" title="نسخ رقم التقرير" style="padding:6px 10px; font-size:13px; border-radius:6px; cursor:pointer;">📋</button>
                        <button type="button" onclick="app.editReport('${repId}')" title="تعديل التقرير" style="padding:6px 10px; font-size:13px; border-radius:6px; cursor:pointer;">✏️</button>
                    </div>
                `;
                reportsList.appendChild(card);
            });
        }
    },

    copyReportId(id) {
        navigator.clipboard.writeText(id).then(() => {
            this.showToast('تم نسخ رقم التقرير!');
        });
    },

    
    // Admin Module State
    adminState: {
        users: [],
        stats: {},
        activeFilter: 'all',
        searchQuery: '',
        selectedUser: null,
        addDurationDays: 30,
        addPlan: 'unlimited',
        addPaySource: 'unlimited',
        allReports: [],
        reportsSearchQuery: '',
        reportsFromDate: '',
        reportsToDate: ''
    },

    // In-App Toast (Zero window.alert)
    showToast(message, type = 'success') {
        const toast = document.getElementById('admin-toast');
        if (!toast) return;
        toast.className = `admin-toast-banner toast-${type}`;
        const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
        toast.innerHTML = `<span style="font-size:1.1rem;">${icon}</span> <span>${message}</span>`;
        toast.style.display = 'flex';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.style.display = 'none';
        }, 3500);
    },

    // Safe button wrapper with loading state (Guaranteed finally restore)
    async executeAdminBtn(btn, asyncFn) {
        if (!btn) return await asyncFn();
        const origHtml = btn.innerHTML;
        const origDisabled = btn.disabled;
        btn.disabled = true;
        btn.innerHTML = '⏳ جاري التنفيذ...';
        try {
            return await asyncFn();
        } finally {
            btn.disabled = origDisabled;
            btn.innerHTML = origHtml;
        }
    },

    // Admin headers for Telegram initData or token auth
    getAdminHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.tg && this.tg.initData) {
            headers['x-telegram-init-data'] = this.tg.initData;
        }
        if (this.state.adminToken) {
            headers['x-admin-token'] = this.state.adminToken;
        }
        const saved = localStorage.getItem('sehaAdminToken');
        if (saved && !this.state.adminToken) {
            headers['x-admin-token'] = saved;
        }
        return headers;
    },

    // Admin Login Trigger (Zero window.prompt)
    promptAdminLogin() {
        const savedToken = localStorage.getItem('sehaAdminToken');
        
        // NOTE: ownership is NOT decided on the client. A saved token is only a
        // credential; the server re-validates it on every admin request and
        // returns 401 if it is not valid, in which case we drop it.
        // SECURITY: never hardcode the admin password here (it is world-readable).
        if (!this.state.adminToken && savedToken) {
            this.state.adminToken = savedToken;
        }
        if (this.state.adminToken) {
            this.navigate('admin');
            return;
        }

        // Open custom HTML modal instead of prompt()
        const modal = document.getElementById('admin-login-modal');
        if (modal) {
            modal.style.display = 'flex';
            const input = document.getElementById('admin_login_code');
            if (input) {
                input.value = '';
                input.focus();
            }
        }
    },

    async submitAdminLogin(btn) {
        await this.executeAdminBtn(btn, async () => {
            const codeInput = document.getElementById('admin_login_code');
            const code = codeInput ? codeInput.value.trim() : '';
            if (!code) {
                this.showToast('الرجاء إدخال رمز المشرف 🚫', 'error');
                return;
            }

            // SECURITY: the password is verified on the SERVER only.
            // The client never knows the secret and never decides authorization.
            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: code })
                });
                const data = await res.json();

                if (data && data.success && data.token) {
                    this.state.adminToken = data.token;
                    localStorage.setItem('sehaAdminToken', data.token);
                    document.getElementById('admin-login-modal').style.display = 'none';
                    this.showToast('تم تسجيل الدخول بنجاح كمدير للنظام', 'success');
                    this.navigate('admin');
                } else {
                    this.showToast((data && data.error) || 'الرمز السري غير صحيح 🚫', 'error');
                }
            } catch (e) {
                this.showToast('تعذر الاتصال بالخادم، حاول مرة أخرى', 'error');
            }
        });
    },

    // Screen Navigation
    navigate(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const targetScreen = document.getElementById(`${screenId}-screen`);
        if (targetScreen) targetScreen.classList.add('active');
        
        const fab = document.getElementById('fab-menu');
        if (fab) {
            fab.style.display = (screenId === 'dashboard') ? 'block' : 'none';
        }
        
        if (screenId === 'admin') {
            this.loadAdminData();
        }
    },

    // Fetch and render admin data
    async loadAdminData(btn) {
        const listEl = document.getElementById('admin-subscribers-list');
        if (listEl && (!this.adminState.users || this.adminState.users.length === 0)) {
            listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">⏳ جاري تحميل بيانات المشتركين...</div>';
        }

        await this.executeAdminBtn(btn, async () => {
            try {
                const headers = this.getAdminHeaders();
                const [statsRes, usersRes] = await Promise.all([
                    fetch('/api/admin/web/stats', { headers }),
                    fetch('/api/admin/web/users', { headers })
                ]);

                if (statsRes.status === 401 || usersRes.status === 401) {
                    this.showToast('غير مصرح لك (تحتاج صلاحية المشرف)', 'error');
                    this.promptAdminLogin();
                    return;
                }

                const statsData = await statsRes.json();
                const usersData = await usersRes.json();

                if (statsData.success && statsData.stats) {
                    this.adminState.stats = statsData.stats;
                    this.renderAdminStats();
                }

                if (usersData.success && Array.isArray(usersData.users)) {
                    this.adminState.users = usersData.users;
                    this.renderAdminUsers();
                }
            } catch (err) {
                console.error('Error loading admin data:', err);
                this.showToast('فشل في تحميل بيانات الإدارة: ' + err.message, 'error');
            }
        });
    },

    // Admin Tab Switching (Subscribers vs All Reports vs Logs)
    switchAdminTab(tabName, btn) {
        document.querySelectorAll('.admin-nav-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = '#f8fafc';
            b.style.color = '#475569';
            b.style.border = '1px solid #cbd5e1';
        });
        if (btn) {
            btn.classList.add('active');
            btn.style.background = '#00a896';
            btn.style.color = 'white';
            btn.style.border = 'none';
        }

        const subTab = document.getElementById('admin-subscribers-tab-content');
        const repTab = document.getElementById('admin-reports-tab-content');
        const logTab = document.getElementById('admin-logs-tab-content');

        if (subTab) subTab.style.display = (tabName === 'subscribers') ? 'block' : 'none';
        if (repTab) repTab.style.display = (tabName === 'reports') ? 'block' : 'none';
        if (logTab) logTab.style.display = (tabName === 'logs') ? 'block' : 'none';

        if (tabName === 'reports') {
            this.loadAdminReports();
        } else if (tabName === 'logs') {
            this.loadAdminLogs();
        }
    },

    // Admin All Reports Module (Rule 19, 20, 21)
    async loadAdminReports(btn) {
        const listEl = document.getElementById('admin-all-reports-list');
        if (listEl && (!this.adminState.allReports || this.adminState.allReports.length === 0)) {
            listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">⏳ جاري تحميل سجل التقارير...</div>';
        }

        await this.executeAdminBtn(btn, async () => {
            try {
                const headers = this.getAdminHeaders();
                const q = this.adminState.reportsSearchQuery || '';
                const fromDate = this.adminState.reportsFromDate || '';
                const toDate = this.adminState.reportsToDate || '';

                const url = new URL('/api/admin/reports', window.location.origin);
                if (q) url.searchParams.set('search', q);
                if (fromDate) url.searchParams.set('fromDate', fromDate);
                if (toDate) url.searchParams.set('toDate', toDate);

                const res = await fetch(url.toString(), { headers });
                if (res.status === 401) {
                    this.showToast('غير مصرح لك (تحتاج صلاحية المشرف)', 'error');
                    this.promptAdminLogin();
                    return;
                }

                const data = await res.json();
                if (data.success && Array.isArray(data.reports)) {
                    this.adminState.allReports = data.reports;
                    this.adminState.totalReportsCount = data.total || data.reports.length;
                    this.renderAdminAllReports();
                } else {
                    this.showToast('فشل في جلب التقارير: ' + (data.error || 'خطأ غير معروف'), 'error');
                }
            } catch (err) {
                console.error('Error loading admin reports:', err);
                this.showToast('فشل في تحميل التقارير: ' + err.message, 'error');
            }
        });
    },

    renderAdminAllReports() {
        const listEl = document.getElementById('admin-all-reports-list');
        const countEl = document.getElementById('admin-reports-count-indicator');
        if (!listEl) return;

        const reports = this.adminState.allReports || [];
        if (countEl) {
            countEl.innerText = `إجمالي التقارير المعروضة: ${reports.length} تقرير`;
        }

        if (reports.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">لا توجد تقارير مطابقة</div>';
            return;
        }

        let html = '';
        for (const r of reports) {
            const repId = r.id || r.report_id || r.service_code || '';
            const pName = r.patient_name || r.patientName || (r.data && (r.data.patient_name_ar || r.data.patient_name_en)) || 'غير محدد';
            const nid = r.national_id || (r.data && r.data.national_id) || '-';
            const date = r.issue_date || r.issueDate || (r.data && r.data.issue_date) || '-';
            const time = r.issue_time || (r.data && r.data.issue_time) || '';
            const shortUrl = r.inquiry_url || r.short_url || r.shortURL || '';
            const userLabel = r.username ? `@${r.username}` : (r.chat_id ? `ID: ${r.chat_id}` : '-');
            const isPoints = (r.payment_type === 'points' || r.points_deducted > 0);
            const payBadge = isPoints ? '<span class="badge badge-points">🪙 5 نقاط</span>' : '<span class="badge badge-unlimited">♾️ غير محدود</span>';
            const typeLabel = r.type === 'companion' ? 'مرافقة مريض' : (r.type === 'companion_review' ? 'مشهد مراجعة' : 'إجازة مرضية');

            html += `
            <div class="admin-subscriber-card" style="margin-bottom:12px; border-left:4px solid #00a896;">
                <div class="sub-card-header">
                    <div>
                        <div class="sub-card-name" style="font-size:15px; font-weight:bold;">
                            ${pName}
                            <span style="font-size:12px; font-weight:normal; color:#64748b;">(هوية: ${nid})</span>
                        </div>
                        <div class="sub-card-cid" style="margin-top:2px;">
                            <span style="color:#00a896; font-family:monospace; font-weight:bold;">${repId}</span>
                            • بواسطة: <strong style="color:#334155;">${userLabel}</strong>
                        </div>
                    </div>
                    <div>${payBadge}</div>
                </div>

                <div style="font-size:12px; color:#64748b; margin:6px 0;">
                    📅 الإصدار: <strong>${date} ${time}</strong> • النوع: <strong>${typeLabel}</strong>
                </div>

                <div class="sub-card-actions" style="display:flex; gap:8px; margin-top:8px;">
                    ${shortUrl ? `<a href="${shortUrl}" target="_blank" style="flex:1; text-align:center; padding:7px 10px; background:#e0f2fe; color:#0369a1; border-radius:6px; font-size:12px; font-weight:bold; text-decoration:none;">🔗 فتح الاستعلام</a>` : ''}
                    <button type="button" onclick="app.copyReportId('${repId}')" class="btn-sub-action" style="flex:1; padding:7px 10px; font-size:12px;">📋 نسخ الرمز</button>
                    ${shortUrl ? `<button type="button" onclick="navigator.clipboard.writeText('${shortUrl}').then(()=>app.showToast('تم نسخ رابط التقرير'))" class="btn-sub-action" style="flex:1; padding:7px 10px; font-size:12px;">📎 نسخ الرابط</button>` : ''}
                </div>
            </div>`;
        }
        listEl.innerHTML = html;
    },

    handleAdminReportsSearch(val) {
        this.adminState.reportsSearchQuery = val;
        clearTimeout(this._reportsSearchTimer);
        this._reportsSearchTimer = setTimeout(() => {
            this.loadAdminReports();
        }, 300);
    },

    handleAdminReportsFilterChange() {
        const fromInput = document.getElementById('admin-reports-from-date');
        const toInput = document.getElementById('admin-reports-to-date');
        this.adminState.reportsFromDate = fromInput ? fromInput.value : '';
        this.adminState.reportsToDate = toInput ? toInput.value : '';
        this.loadAdminReports();
    },

    resetAdminReportsFilters() {
        const fromInput = document.getElementById('admin-reports-from-date');
        const toInput = document.getElementById('admin-reports-to-date');
        const searchInput = document.getElementById('admin-reports-search-input');
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        if (searchInput) searchInput.value = '';
        this.adminState.reportsFromDate = '';
        this.adminState.reportsToDate = '';
        this.adminState.reportsSearchQuery = '';
        this.loadAdminReports();
    },

    async loadAdminLogs(btn) {
        const listEl = document.getElementById('admin-system-logs-list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">⏳ جاري تحميل سجل العمليات...</div>';

        await this.executeAdminBtn(btn, async () => {
            try {
                const headers = this.getAdminHeaders();
                const res = await fetch('/api/admin/logs', { headers });
                if (res.status === 401) {
                    this.showToast('غير مصرح لك (تحتاج صلاحية المشرف)', 'error');
                    this.promptAdminLogin();
                    return;
                }
                const data = await res.json();
                const logs = data.logs || (data.success && data.transactions) || [];
                if (logs.length === 0) {
                    listEl.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px;">لا توجد عمليات مسجلة</div>';
                    return;
                }
                let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
                for (const l of logs) {
                    const time = l.timestamp ? new Date(l.timestamp).toLocaleString('ar-SA') : '';
                    const op = l.operation || l.type || 'عملية';
                    html += `
                    <div style="padding:10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:12px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <strong style="color:#0f172a;">${op}</strong>
                            <span style="color:#64748b; font-size:11px;">${time}</span>
                        </div>
                        <div style="color:#334155;">${l.details || l.message || ''}</div>
                        ${l.target_chat_id ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">المشترك: ${l.target_chat_id}</div>` : ''}
                    </div>`;
                }
                html += '</div>';
                listEl.innerHTML = html;
            } catch (err) {
                listEl.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">خطأ في تحميل السجل: ${err.message}</div>`;
            }
        });
    },

    renderAdminStats() {
        const s = this.adminState.stats || {};
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = (val != null) ? val : '0';
        };
        setVal('stat-total-users', s.totalSubscribers);
        setVal('stat-active-users', s.activeSubscribers);
        setVal('stat-suspended-users', s.suspendedSubscribers);
        setVal('stat-cancelled-users', s.expiredSubscribers);
        setVal('stat-total-reports', s.totalReports);
        setVal('stat-total-points', s.totalPoints);
        setVal('stat-points-users', s.pointsSubscribers);
        setVal('stat-unlimited-users', s.unlimitedSubscribers);
    },

    renderAdminUsers() {
        const listEl = document.getElementById('admin-subscribers-list');
        if (!listEl) return;

        let filtered = (this.adminState.users || []).slice();
        
        // Filter by Status Tab
        if (this.adminState.activeFilter === 'active') {
            filtered = filtered.filter(u => u.status === 'active' && u.daysRemaining > 0);
        } else if (this.adminState.activeFilter === 'suspended') {
            filtered = filtered.filter(u => u.status === 'suspended');
        } else if (this.adminState.activeFilter === 'cancelled') {
            filtered = filtered.filter(u => u.status === 'cancelled' || u.daysRemaining <= 0);
        }

        // Filter by Search Query
        if (this.adminState.searchQuery) {
            const q = this.adminState.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(u => 
                String(u.chatId).toLowerCase().includes(q) ||
                String(u.username || '').toLowerCase().includes(q) ||
                String(u.name || '').toLowerCase().includes(q)
            );
        }

        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">لا توجد نتائج مطابقة</div>';
            return;
        }

        let html = '';
        for (const u of filtered) {
            const ownerName = (this.state.config.ownerUsername || '').toLowerCase().replace(/^@/, '');
            const isOwner = Boolean(ownerName) && String(u.username || '').toLowerCase().replace(/^@/, '') === ownerName;
            const statusClass = u.status === 'active' && u.daysRemaining > 0 ? 'badge-active' : (u.status === 'suspended' ? 'badge-suspended' : 'badge-cancelled');
            const statusLabel = u.status === 'active' && u.daysRemaining > 0 ? '🟢 فعال' : (u.status === 'suspended' ? '⏸️ موقوف' : (u.status === 'cancelled' ? '❌ ملغي' : '⏳ منتهي'));
            
            const payBadge = u.report_payment_source === 'unlimited' ? '<span class="badge badge-unlimited">♾️ غير محدود</span>' : '<span class="badge badge-points">🪙 نقاط</span>';
            const ownerBadge = isOwner ? '<span class="badge badge-owner">👑 المالك</span>' : '';

            html += `
            <div class="admin-subscriber-card ${isOwner ? 'is-owner' : ''}" id="user-card-${u.chatId}">
                <div class="sub-card-header">
                    <div>
                        <div class="sub-card-name">
                            <span>${u.name || (u.username ? '@' + u.username : 'مشترك')}</span>
                            ${ownerBadge}
                        </div>
                        <div class="sub-card-cid">ID: ${u.chatId} ${u.username ? '(@' + u.username + ')' : ''}</div>
                    </div>
                    <span class="badge ${statusClass}">${statusLabel}</span>
                </div>
                
                <div class="sub-card-badges">
                    ${payBadge}
                    <span class="badge" style="background:#f1f5f9; color:#475569;">${u.plan === 'unlimited' ? 'باقة غير محدودة' : 'باقة نقاط'}</span>
                </div>

                <div class="sub-card-meta-grid">
                    <div class="sub-meta-item">
                        <div class="val">${u.points || 0}</div>
                        <div class="lbl">الرصيد (نقاط)</div>
                    </div>
                    <div class="sub-meta-item">
                        <div class="val">${u.daysRemaining || 0}</div>
                        <div class="lbl">الأيام المتبقية</div>
                    </div>
                    <div class="sub-meta-item">
                        <div class="val">${u.reportsCount || 0}</div>
                        <div class="lbl">التقارير</div>
                    </div>
                </div>

                <div class="sub-card-actions">
                    <button type="button" class="btn-sub-action-main" onclick="app.openManageUserModal('${u.chatId}')">⚙️ إدارة المشترك</button>
                    <button type="button" class="btn-sub-action-sub" onclick="app.openDirectUserReports('${u.chatId}', this)">📄 التقارير</button>
                    <button type="button" class="btn-sub-action-sub" onclick="app.openDirectUserLogs('${u.chatId}', this)">📋 السجل</button>
                </div>
            </div>`;
        }

        listEl.innerHTML = html;
    },

    handleAdminSearch(val) {
        this.adminState.searchQuery = val;
        this.renderAdminUsers();
    },

    setAdminFilter(filter, btn) {
        this.adminState.activeFilter = filter;
        document.querySelectorAll('.admin-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderAdminUsers();
    },

    // Modal helpers
    closeAdminModals() {
        ['admin-add-modal', 'admin-manage-modal', 'admin-reports-modal', 'admin-logs-modal', 'admin-login-modal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const confirmBox = document.getElementById('admin-cancel-confirm-box');
        if (confirmBox) confirmBox.style.display = 'none';
    },

    openAddUserModal() {
        this.closeAdminModals();
        const modal = document.getElementById('admin-add-modal');
        if (!modal) return;
        
        document.getElementById('admin_add_chat_id').value = '';
        document.getElementById('admin_add_username').value = '';
        document.getElementById('admin_add_name').value = '';
        document.getElementById('admin_add_points').value = '0';
        this.selectAddDuration(30);
        this.handleAddPlanClick('unlimited');
        this.handleAddPaySourceClick('unlimited');
        
        modal.style.display = 'flex';
    },

    selectAddDuration(days, btn) {
        this.adminState.addDurationDays = days;
        document.querySelectorAll('#admin-add-modal .btn-preset').forEach(b => b.classList.remove('active'));
        if (btn) {
            btn.classList.add('active');
        } else {
            const presetBtn = document.querySelector(`#admin-add-modal .btn-preset[data-days="${days}"]`);
            if (presetBtn) presetBtn.classList.add('active');
        }
        
        const customWrap = document.getElementById('admin_add_custom_days_wrap');
        if (customWrap) {
            customWrap.style.display = (days === 'custom') ? 'block' : 'none';
        }
    },

    handleAddPlanClick(plan) {
        this.adminState.addPlan = plan;
        const u = document.getElementById('lbl-plan-unlimited');
        const p = document.getElementById('lbl-plan-points');
        if (u && p) {
            if (plan === 'unlimited') {
                u.classList.add('active');
                p.classList.remove('active');
            } else {
                p.classList.add('active');
                u.classList.remove('active');
            }
        }
    },

    handleAddPaySourceClick(source) {
        this.adminState.addPaySource = source;
        const u = document.getElementById('lbl-pay-unlimited');
        const p = document.getElementById('lbl-pay-points');
        if (u && p) {
            if (source === 'unlimited') {
                u.classList.add('active');
                p.classList.remove('active');
            } else {
                p.classList.add('active');
                u.classList.remove('active');
            }
        }
    },

    async submitAddUser() {
        const btn = document.getElementById('btn-admin-submit-add');
        await this.executeAdminBtn(btn, async () => {
            const chatId = document.getElementById('admin_add_chat_id').value.trim();
            const username = document.getElementById('admin_add_username').value.trim();
            const name = document.getElementById('admin_add_name').value.trim();
            const points = parseInt(document.getElementById('admin_add_points').value) || 0;
            
            let days = this.adminState.addDurationDays;
            if (days === 'custom') {
                days = parseInt(document.getElementById('admin_add_custom_days').value) || 0;
            }

            if (!chatId) {
                this.showToast('الرجاء إدخال الـ Chat ID', 'error');
                return;
            }

            try {
                const res = await fetch('/api/admin/web/user/add', {
                    method: 'POST',
                    headers: this.getAdminHeaders(),
                    body: JSON.stringify({
                        chatId,
                        username,
                        name,
                        subscriptionDays: days,
                        plan: this.adminState.addPlan,
                        balance_points: points,
                        report_payment_source: this.adminState.addPaySource
                    })
                });

                const data = await res.json();
                if (data.success) {
                    this.showToast('تمت إضافة المشترك بنجاح ✅', 'success');
                    this.closeAdminModals();
                    // Add to local state and update UI instantly
                    if (data.user) {
                        this.adminState.users.unshift(data.user);
                    }
                    this.renderAdminUsers();
                    // Refresh stats
                    this.loadAdminData();
                } else {
                    this.showToast(data.error || 'فشلت إضافة المشترك', 'error');
                }
            } catch (err) {
                this.showToast('خطأ في الاتصال: ' + err.message, 'error');
            }
        });
    },

    openManageUserModal(chatId) {
        const user = (this.adminState.users || []).find(u => String(u.chatId) === String(chatId));
        if (!user) {
            this.showToast('المشترك غير موجود', 'error');
            return;
        }

        this.adminState.selectedUser = user;
        this.renderManageModalContent(user);
        
        const modal = document.getElementById('admin-manage-modal');
        if (modal) modal.style.display = 'flex';
    },

    renderManageModalContent(u) {
        const cardEl = document.getElementById('admin-manage-user-card');
        if (cardEl) {
            const ownerName = (this.state.config.ownerUsername || '').toLowerCase().replace(/^@/, '');
            const isOwner = Boolean(ownerName) && String(u.username || '').toLowerCase().replace(/^@/, '') === ownerName;
            cardEl.innerHTML = `
                <div style="font-weight:800; font-size:1.05rem; color:#0f172a; margin-bottom:6px;">
                    ${u.name || (u.username ? '@' + u.username : 'مشترك')}
                    ${isOwner ? '<span class="badge badge-owner" style="margin-right:6px;">👑 المالك</span>' : ''}
                </div>
                <div class="summary-line"><span>Chat ID:</span> <span style="font-family:monospace; direction:ltr;">${u.chatId}</span></div>
                <div class="summary-line"><span>اسم المستخدم:</span> <span>${u.username ? '@' + u.username : 'غير محدد'}</span></div>
                <div class="summary-line"><span>الحالة:</span> <span>${u.status === 'active' && u.daysRemaining > 0 ? '🟢 فعال' : (u.status === 'suspended' ? '⏸️ موقوف' : '❌ ملغي / منتهي')}</span></div>
                <div class="summary-line"><span>مصدر الدفع:</span> <span>${u.report_payment_source === 'unlimited' ? '♾️ غير محدود' : '🪙 بالنقاط (5/تقرير)'}</span></div>
                <div class="summary-line"><span>الرصيد الحالي:</span> <span>${u.points || 0} نقطة</span></div>
                <div class="summary-line"><span>تاريخ البداية:</span> <span>${u.subscription_start_date ? u.subscription_start_date.split('T')[0] : '-'}</span></div>
                <div class="summary-line"><span>تاريخ النهاية:</span> <span>${u.subscription_end_date ? u.subscription_end_date.split('T')[0] : '-'}</span></div>
                <div class="summary-line"><span>الأيام المتبقية:</span> <span>${u.daysRemaining || 0} يوم</span></div>
                <div class="summary-line"><span>عدد التقارير:</span> <span>${u.reportsCount || 0} تقرير</span></div>
            `;
        }

        // Highlight active toggle buttons
        const btnUnl = document.getElementById('btn-set-paysrc-unlimited');
        const btnPts = document.getElementById('btn-set-paysrc-points');
        if (btnUnl && btnPts) {
            if (u.report_payment_source === 'unlimited') {
                btnUnl.classList.add('active');
                btnPts.classList.remove('active');
            } else {
                btnPts.classList.add('active');
                btnUnl.classList.remove('active');
            }
        }
        
        const confirmBox = document.getElementById('admin-cancel-confirm-box');
        if (confirmBox) confirmBox.style.display = 'none';
    },

    async adminModifyPoints(action, btn) {
        if (!this.adminState.selectedUser) return;
        const input = document.getElementById('admin_pts_input');
        const amount = parseInt(input ? input.value : 0) || 0;
        if (amount <= 0) {
            this.showToast('الرجاء إدخال عدد نقاط صحيح أكبر من صفر', 'error');
            return;
        }

        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch('/api/admin/web/user/update', {
                    method: 'POST',
                    headers: this.getAdminHeaders(),
                    body: JSON.stringify({
                        chatId: this.adminState.selectedUser.chatId,
                        action: action === 'add' ? 'add_points' : 'remove_points',
                        amount: amount
                    })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.showToast(data.message, 'success');
                    this.updateUserInState(data.user);
                } else {
                    this.showToast(data.error || 'فشلت العملية', 'error');
                }
            } catch (err) {
                this.showToast('خطأ في الاتصال: ' + err.message, 'error');
            }
        });
    },

    async adminSetPaymentSource(source, btn) {
        if (!this.adminState.selectedUser) return;
        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch('/api/admin/web/user/update', {
                    method: 'POST',
                    headers: this.getAdminHeaders(),
                    body: JSON.stringify({
                        chatId: this.adminState.selectedUser.chatId,
                        action: 'set_payment_source',
                        paymentSource: source
                    })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.showToast(data.message, 'success');
                    this.updateUserInState(data.user);
                } else {
                    this.showToast(data.error || 'فشلت العملية', 'error');
                }
            } catch (err) {
                this.showToast('خطأ في الاتصال: ' + err.message, 'error');
            }
        });
    },

    async adminSetStatus(status, btn) {
        if (!this.adminState.selectedUser) return;
        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch('/api/admin/web/user/update', {
                    method: 'POST',
                    headers: this.getAdminHeaders(),
                    body: JSON.stringify({
                        chatId: this.adminState.selectedUser.chatId,
                        action: 'set_status',
                        status: status
                    })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.showToast(data.message, 'success');
                    this.updateUserInState(data.user);
                } else {
                    this.showToast(data.error || 'فشلت العملية', 'error');
                }
            } catch (err) {
                this.showToast('خطأ في الاتصال: ' + err.message, 'error');
            }
        });
    },

    async adminRenew(days, btn) {
        if (!this.adminState.selectedUser) return;
        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch('/api/admin/web/user/update', {
                    method: 'POST',
                    headers: this.getAdminHeaders(),
                    body: JSON.stringify({
                        chatId: this.adminState.selectedUser.chatId,
                        action: 'renew',
                        days: days
                    })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.showToast(data.message, 'success');
                    this.updateUserInState(data.user);
                } else {
                    this.showToast(data.error || 'فشلت العملية', 'error');
                }
            } catch (err) {
                this.showToast('خطأ في الاتصال: ' + err.message, 'error');
            }
        });
    },

    async adminRenewCustom(btn) {
        const input = document.getElementById('admin_renew_custom_days');
        const days = parseInt(input ? input.value : 0) || 0;
        if (days <= 0) {
            this.showToast('الرجاء إدخال عدد أيام صحيح', 'error');
            return;
        }
        await this.adminRenew(days, btn);
    },

    promptCancelSubscription() {
        const box = document.getElementById('admin-cancel-confirm-box');
        if (box) box.style.display = 'block';
    },

    async executeCancelSubscription(btn) {
        if (!this.adminState.selectedUser) return;
        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch('/api/admin/web/user/update', {
                    method: 'POST',
                    headers: this.getAdminHeaders(),
                    body: JSON.stringify({
                        chatId: this.adminState.selectedUser.chatId,
                        action: 'cancel'
                    })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.showToast(data.message, 'success');
                    this.updateUserInState(data.user);
                } else {
                    this.showToast(data.error || 'فشلت العملية', 'error');
                }
            } catch (err) {
                this.showToast('خطأ في الاتصال: ' + err.message, 'error');
            }
        });
    },

    updateUserInState(updatedUser) {
        this.adminState.selectedUser = updatedUser;
        const idx = (this.adminState.users || []).findIndex(u => String(u.chatId) === String(updatedUser.chatId));
        if (idx >= 0) {
            this.adminState.users[idx] = updatedUser;
        }
        this.renderManageModalContent(updatedUser);
        this.renderAdminUsers();
        this.loadAdminData();
    },

    async openUserReportsModal(btn) {
        if (!this.adminState.selectedUser) return;
        await this.openDirectUserReports(this.adminState.selectedUser.chatId, btn);
    },

    async openDirectUserReports(chatId, btn) {
        const modal = document.getElementById('admin-reports-modal');
        const body = document.getElementById('admin-reports-modal-body');
        if (modal) modal.style.display = 'flex';
        if (body) body.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">⏳ جاري تحميل التقارير...</div>';

        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch(`/api/admin/web/user/${chatId}/reports`, {
                    headers: this.getAdminHeaders()
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.reports)) {
                    if (data.reports.length === 0) {
                        body.innerHTML = '<div style="text-align:center; padding:25px; color:#94a3b8;">لا توجد تقارير مسجلة لهذا المشترك</div>';
                        return;
                    }
                    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
                    for (const r of data.reports) {
                        html += `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                            <div style="display:flex; justify-content:space-between; font-weight:700; font-size:0.9rem;">
                                <span>${r.patientName || 'مريض'}</span>
                                <span style="font-family:monospace; color:#0d9488;">${r.id || '-'}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#64748b; margin-top:4px;">
                                <span>نوع: ${r.type === 'companion' ? 'مرافقة' : (r.type === 'companion_review' ? 'مشهد مرافق' : 'إجازة مرضية')}</span>
                                <span>التاريخ: ${r.issueDate || '-'}</span>
                            </div>
                        </div>`;
                    }
                    html += '</div>';
                    body.innerHTML = html;
                } else {
                    body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">${data.error || 'فشل جلب التقارير'}</div>`;
                }
            } catch (err) {
                body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">خطأ: ${err.message}</div>`;
            }
        });
    },

    async openUserLogsModal(btn) {
        if (!this.adminState.selectedUser) return;
        await this.openDirectUserLogs(this.adminState.selectedUser.chatId, btn);
    },

    async openDirectUserLogs(chatId, btn) {
        const modal = document.getElementById('admin-logs-modal');
        const body = document.getElementById('admin-logs-modal-body');
        if (modal) modal.style.display = 'flex';
        if (body) body.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">⏳ جاري تحميل سجل العمليات...</div>';

        await this.executeAdminBtn(btn, async () => {
            try {
                const res = await fetch(`/api/admin/web/user/${chatId}/logs`, {
                    headers: this.getAdminHeaders()
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.logs)) {
                    if (data.logs.length === 0) {
                        body.innerHTML = '<div style="text-align:center; padding:25px; color:#94a3b8;">لا توجد حركات مسجلة لهذا المشترك</div>';
                        return;
                    }
                    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
                    for (const l of data.logs) {
                        const dateStr = l.timestamp ? l.timestamp.replace('T', ' ').split('.')[0] : '-';
                        html += `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                            <div style="display:flex; justify-content:space-between; font-weight:700; font-size:0.85rem; color:#0f172a;">
                                <span>${l.details || l.operation}</span>
                                <span style="font-size:0.75rem; color:#64748b;">${dateStr}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#64748b; margin-top:4px;">
                                <span>العملية: <code>${l.operation}</code></span>
                                ${l.amount != null ? `<span>الكمية: <b>${l.amount}</b></span>` : ''}
                            </div>
                        </div>`;
                    }
                    html += '</div>';
                    body.innerHTML = html;
                } else {
                    body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">${data.error || 'فشل جلب السجلات'}</div>`;
                }
            } catch (err) {
                body.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">خطأ: ${err.message}</div>`;
            }
        });
    },

    toggleFab() {
        const fabContainer = document.getElementById('fab-menu');
        const overlay = document.getElementById('fab-overlay');
        const fabMain = document.getElementById('fab-main');
        
        fabContainer.classList.toggle('active');
        overlay.classList.toggle('active');
        fabMain.classList.toggle('active');
    },

    startForm(type) {
        this.toggleFab();
        this.state.leaveType = type;
        this.state.currentStep = 1;
        
        let title = 'إصدار تقرير جديد';
        if (type === 'sickleave') title = 'إصدار تقرير إجازة مرضية';
        else if (type === 'companion') title = 'إصدار تقرير مرافقة مريض';
        else if (type === 'companion_review') title = 'إصدار مشهد مراجعة لمرافق';
        document.getElementById('form-title').innerText = title;
        
        const typeSelect = document.getElementById('leave_type');
        typeSelect.innerHTML = '<option value="GSL">GSL</option><option value="PSL">PSL</option>';
        
        const isCompanionType = (type === 'companion' || type === 'companion_review');
        document.getElementById('escort-fields').style.display = isCompanionType ? 'block' : 'none';
        
        // Dynamically move National ID field based on type
        const idGroup = document.getElementById('national-id-group');
        if (idGroup) {
            if (isCompanionType) {
                const datesRow = document.querySelector('#escort-fields .dates-row');
                document.getElementById('escort-fields').insertBefore(idGroup, datesRow);
            } else {
                const step2 = document.getElementById('step-2');
                step2.insertBefore(idGroup, step2.firstChild);
            }
        }
        
        this.updateWizardUI();
        this.navigate('form');
        
        // Auto-fill current date and time
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(now - offset)).toISOString().slice(0, -1);
        const todayStr = localISOTime.split('T')[0];
        
        document.getElementById('issue_date').value = todayStr;
        document.getElementById('admission_date').value = todayStr;
        document.getElementById('discharge_date').value = todayStr;
        
        let randHours = Math.floor(Math.random() * 24).toString().padStart(2, '0');
        let randMinutes = Math.floor(Math.random() * 60).toString().padStart(2, '0');
        document.getElementById('issue_time').value = `${randHours}:${randMinutes}`;

        // 🧪 In demo mode every form opens pre-filled with the fixed dataset
        // for its report type, with all fields locked.
        if (this.state.testMode) this.applyTestData();
    },

    syncHospitalEn() {
        const ar = document.getElementById('hospital_ar').value;
        const enInput = document.getElementById('hospital_en');
        const map = {
            "مستشفى الملك خالد بنجران": "King Khalid Hospital, Najran",
            "مستشفى نجران العام": "Najran General Hospital",
            "مستشفى الولادة والأطفال بنجران": "Maternity and Children Hospital, Najran",
            "مستشفى إرادة والصحة النفسية بنجران": "Eradah and Mental Health Hospital, Najran",
            "مستشفى القوات المسلحة بنجران": "Najran Armed Forces Hospital",
            "مستشفى خباش العام": "Khabash General Hospital",
            "مستشفى حبونا العام": "Habuna General Hospital",
            "مستشفى شرورة العام": "Sharurah General Hospital",
            "مستشفى بدر الجنوب": "Badr Al-Janoub Hospital",
            "مستشفى ثار": "Thar Hospital",
            "مستشفى يدمة العام": "Yadamah General Hospital",
            "مستشفى الملك عبدالعزيز التخصصي بالطائف": "King Abdulaziz Specialist Hospital, Taif",
            "مستشفى الملك فيصل بالطائف": "King Faisal Hospital, Taif",
            "مستشفى الأطفال بالطائف": "Children’s Hospital, Taif",
            "مستشفى الولادة والأطفال بالطائف": "Maternity and Children Hospital, Taif",
            "مستشفى القوات المسلحة بالهدا": "Al-Hada Armed Forces Hospital",
            "مستشفى الأمير منصور العسكري": "Prince Mansour Military Hospital",
            "مستشفى الصحة النفسية بالطائف": "Mental Health Hospital, Taif",
            "مستشفى النهضة العام": "Al Nahda General Hospital, Taif",
            "مستشفى الملك خالد ومركز الأمير سلطان للخدمات الصحية بالخرج": "King Khalid Hospital and Prince Sultan Health Services Center, Al-Kharj",
            "مستشفى الولادة والأطفال بالخرج": "Maternity and Children Hospital, Al-Kharj",
            "مستشفى إرادة والصحة النفسية بالخرج": "Eradah and Mental Health Hospital, Al-Kharj",
            "مستشفى القوات المسلحة بالخرج": "Armed Forces Hospital, Al-Kharj",
            "مستشفى الملك خالد بحفر الباطن": "King Khalid Hospital, Hafar Al-Batin",
            "مستشفى حفر الباطن المركزي": "Hafar Al-Batin Central Hospital",
            "مستشفى الولادة والأطفال بحفر الباطن": "Maternity and Children Hospital, Hafar Al-Batin",
            "مستشفى الصحة النفسية بحفر الباطن": "Mental Health Hospital, Hafar Al-Batin",
            "مستشفى نور محمد خان": "Noor Mohammad Khan Hospital",
            "مستشفى الملك فهد التخصصي ببريدة": "King Fahad Specialist Hospital, Buraydah",
            "مستشفى بريدة المركزي": "Buraydah Central Hospital",
            "مستشفى الملك سعود بعنيزة": "King Saud Hospital, Unaizah",
            "مستشفى الرس العام": "Al-Rass General Hospital",
            "مستشفى الولادة والأطفال ببريدة": "Maternity and Children Hospital, Buraydah",
            "مستشفى البكيرية العام": "Al Bukayriyah General Hospital",
            "مستشفى المذنب العام": "Al-Mithnab General Hospital",
            "مستشفى عيون الجواء العام": "Uyun Al-Jiwa General Hospital",
            "مستشفى الملك فهد بالباحة": "King Fahad Hospital, Al-Baha",
            "مستشفى الأمير مشاري بن سعود": "Prince Mishari Bin Saud Hospital",
            "مستشفى بلجرشي العام": "Baljurashi General Hospital",
            "مستشفى المخواة العام": "Al Makhwah General Hospital",
            "مستشفى قلوة العام": "Qilwah General Hospital",
            "مستشفى العقيق العام": "Al Aqiq General Hospital",
            "مستشفى الملك فهد المركزي بجازان": "King Fahad Central Hospital, Jazan",
            "مستشفى الأمير محمد بن ناصر": "Prince Mohammed Bin Nasser Hospital",
            "مستشفى جازان العام": "Jazan General Hospital",
            "مستشفى الملك عبدالله بجازان": "King Abdullah Hospital, Jazan",
            "مستشفى صبيا العام": "Sabya General Hospital",
            "مستشفى أبو عريش العام": "Abu Arish General Hospital",
            "مستشفى صامطة العام": "Samtah General Hospital",
            "مستشفى بيش العام": "Bish General Hospital",
            "مستشفى فرسان العام": "Farasan General Hospital",
            "مستشفى الملك فهد بسكاكا": "King Fahad Hospital, Sakaka",
            "مستشفى الأمير متعب بن عبدالعزيز": "Prince Mutaib Bin Abdulaziz Hospital",
            "مستشفى سكاكا العام": "Sakaka General Hospital",
            "مستشفى دومة الجندل العام": "Dumat Al-Jandal General Hospital",
            "مستشفى القريات العام": "Al-Qurayyat General Hospital",
            "مستشفى طبرجل العام": "Tabarjal General Hospital",
            "مستشفى عرعر المركزي": "Arar Central Hospital",
            "مستشفى الأمير عبدالعزيز بن مساعد": "Prince Abdulaziz Bin Musaed Hospital",
            "مستشفى طريف العام": "Turaif General Hospital",
            "مستشفى رفحاء العام": "Rafha General Hospital",
            "مستشفى العويقيلة العام": "Al-Uwayqilah General Hospital"
        };
        if (map[ar]) {
            enInput.value = map[ar];
        }
    },

    editReport(id) {
        const report = this.state.reports.find(r => r.id === id);
        if(!report || !report.data) {
            this.showToast('عذراً، بيانات هذا التقرير القديم غير متوفرة للتعديل.', 'error');
            return;
        }
        
        this.startForm(report.type);
        
        // Populate fields
        for (const [key, value] of Object.entries(report.data)) {
            const el = document.getElementById(key);
            if(el && key !== 'hospital_type') {
                el.value = value || '';
            }
        }
        
        // Radio button
        if(report.data.hospital_type) {
            const radio = document.querySelector(`input[name="hospital_type"][value="${report.data.hospital_type}"]`);
            if(radio) {
                radio.checked = true;
                this.toggleLicense();
            }
        }
    },

    updateWizardUI() {
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        document.getElementById(`step-${this.state.currentStep}`).classList.add('active');
        
        const progress = (this.state.currentStep / 3) * 100;
        document.getElementById('form-progress').style.width = `${progress}%`;
    },

    nextStep() {
        // Simple required validation
        const currentForm = document.getElementById(`step-${this.state.currentStep}`);
        const inputs = currentForm.querySelectorAll('input[required], select[required]');
        let valid = true;
        inputs.forEach(i => {
            if(!i.value) {
                valid = false;
                i.style.borderColor = 'red';
            } else {
                i.style.borderColor = '#ddd';
            }
        });
        
        if(!valid) {
            this.showToast('يرجى تعبئة الحقول المطلوبة.', 'error');
            return;
        }

        if (this.state.currentStep < 3) {
            this.state.currentStep++;
            this.updateWizardUI();
        }
    },

    prevStep() {
        if (this.state.currentStep > 1) {
            this.state.currentStep--;
            this.updateWizardUI();
        }
    },

    toggleLicense() {
        const isPrivate = document.querySelector('input[name="hospital_type"]:checked').value === 'private';
        const licenseField = document.getElementById('license-field');
        const licenseInput = document.getElementById('license_number');
        
        if (isPrivate) {
            licenseField.style.display = 'block';
            licenseInput.value = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            document.getElementById('leave_type').value = 'PSL';
        } else {
            licenseField.style.display = 'none';
            licenseInput.value = '';
            document.getElementById('leave_type').value = 'GSL';
        }
    },

    handleLogoUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.state.hospitalLogoUrl = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    },

    buyPackage(pkgName) {
        const contact = this.state.config.ownerContact;
        if (!contact) {
            this.showToast('لم يتم ضبط جهة التواصل. تواصل مع الإدارة.', 'error');
            return;
        }
        if (this.tg) {
            this.tg.openTelegramLink(contact);
        } else {
            window.open(contact, '_blank');
        }
    },

    // =================================================================
    // وضع تجريبي (🧪): بيانات ثابتة + قفل الحقول
    // الغرض: عرض/تجربة النموذج وتوليد التقارير بدون إدخال يدوي.
    // لا يُرسل بيانات حقيقية ولا يعدّل حسابات المشتركين.
    // =================================================================
    TEST_MODE_DATA: {
        sickleave: {
            admission_date: '2026-03-08', discharge_date: '2026-03-12', duration: '4',
            issue_date: '2026-03-12', issue_time: '09:45',
            national_id: '1098765432',
            patient_name_ar: 'محمد علي الزهراني', patient_name_en: 'MOHAMMED ALI ALZAHRANI',
            nationality: 'سعودي', employer: 'وزارة الصحة',
            doctor_name_ar: 'د. أحمد سعيد الغامدي', doctor_name_en: 'DR. AHMED S. ALGHAMDI',
            job_title_ar: 'طبيب عام', job_title_en: 'General Practitioner',
            hospital_ar: 'مستشفى الملك فهد العام', hospital_en: 'King Fahd General Hospital'
        },
        companion: {
            admission_date: '2026-03-08', discharge_date: '2026-03-12', duration: '4',
            issue_date: '2026-03-12', issue_time: '09:45',
            national_id: '1098765432',
            escort_name_ar: 'سارة أحمد القحطاني', escort_name_en: 'SARA AHMED ALQAHTANI',
            relation_ar: 'زوجة', relation_en: 'Spouse',
            nationality: 'سعودي', employer: 'وزارة الصحة',
            doctor_name_ar: 'د. أحمد سعيد الغامدي', doctor_name_en: 'DR. AHMED S. ALGHAMDI',
            job_title_ar: 'طبيب عام', job_title_en: 'General Practitioner',
            hospital_ar: 'مستشفى الملك فهد العام', hospital_en: 'King Fahd General Hospital'
        },
        companion_review: {
            admission_date: '2026-03-08', discharge_date: '2026-03-12', duration: '4',
            issue_date: '2026-03-12', issue_time: '09:45',
            national_id: '1098765432',
            escort_name_ar: 'سارة أحمد القحطاني', escort_name_en: 'SARA AHMED ALQAHTANI',
            relation_ar: 'زوجة', relation_en: 'Spouse',
            nationality: 'سعودي', employer: 'وزارة الصحة',
            doctor_name_ar: 'د. أحمد سعيد الغامدي', doctor_name_en: 'DR. AHMED S. ALGHAMDI',
            job_title_ar: 'طبيب عام', job_title_en: 'General Practitioner',
            hospital_ar: 'مستشفى الملك فهد العام', hospital_en: 'King Fahd General Hospital'
        }
    },

    // Toggle the demo mode on/off
    toggleTestMode() {
        this.state.testMode = !this.state.testMode;
        const btn = document.getElementById('btn-test-mode');
        if (btn) {
            btn.classList.toggle('active', this.state.testMode);
            // Active state is applied inline so style.css stays identical to the
            // reference stylesheet.
            btn.style.background = this.state.testMode ? '#e74c3c' : '';
            btn.style.color = this.state.testMode ? '#ffffff' : '';
            btn.title = this.state.testMode ? 'اضغط لإيقاف الوضع التجريبي' : 'تعبئة النموذج ببيانات ثابتة وقفل الحقول';
        }

        if (this.state.testMode) {
            this.applyTestData();
            this.showToast('تم تفعيل الوضع التجريبي — الحقول مقفلة ببيانات ثابتة', 'success');
        } else {
            this.setFormLocked(false);
            const form = document.getElementById('report-form');
            if (form) form.reset();
            this.showToast('تم إيقاف الوضع التجريبي', 'info');
        }
    },

    // Fill the visible form with the fixed demo dataset for the current report type
    applyTestData() {
        const type = this.state.leaveType || 'sickleave';
        const data = this.TEST_MODE_DATA[type] || this.TEST_MODE_DATA.sickleave;

        for (const [id, value] of Object.entries(data)) {
            const el = document.getElementById(id);
            if (el) el.value = value;
        }

        // Companion reports keep the national id inside the escort block.
        // For the other report types the escort fields must be cleared, otherwise
        // the previous demo values would linger in the (hidden) inputs.
        if (type !== 'companion' && type !== 'companion_review') {
            ['escort_name_ar', 'escort_name_en', 'relation_ar', 'relation_en'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const escort = document.getElementById('escort-fields');
            if (escort) escort.style.display = 'none';
        }

        this.setFormLocked(true);
    },

    // Lock / unlock every control of the report form.
    // pointer-events is used (instead of `disabled`) so values stay readable and
    // the visual design is unchanged.
    setFormLocked(locked) {
        const root = document.getElementById('report-form') || document.getElementById('form-screen');
        if (!root) return;

        root.querySelectorAll('input, select, textarea').forEach((el) => {
            const type = (el.type || '').toLowerCase();
            const isSelector = type === 'checkbox' || type === 'radio' || type === 'file' || el.tagName === 'SELECT';
            el.style.pointerEvents = locked ? 'none' : '';
            el.style.opacity = locked ? '0.75' : '';
            if (!isSelector) {
                el.readOnly = locked;
            }
        });

        root.classList.toggle('test-locked', locked);
    },

    async loadPdfTemplate() {
        const res = await fetch('pdf-template.html');
        const html = await res.text();
        document.getElementById('pdf-container').innerHTML = html;
    },

    getHijriDate(dateString) {
        if(!dateString) return "";
        const date = new Date(dateString);
        const parts = new Intl.DateTimeFormat('en-GB-u-ca-islamic', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).formatToParts(date);
        
        let d = '01', m = '01', y = '1448';
        parts.forEach(p => {
            if(p.type === 'day') d = p.value;
            if(p.type === 'month') m = p.value;
            if(p.type === 'year') y = p.value;
        });
        
        // Strip any non-numeric from year (like B, AH, etc)
        y = y.replace(/\D/g, '');
        d = d.padStart(2, '0');
        m = m.padStart(2, '0');
        
        return `${d}-${m}-${y}`;
    },

    formatGregorian(dateString) {
        if(!dateString) return "";
        const parts = dateString.split('-');
        if(parts.length===3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return dateString;
    },

    formatAMPM(timeStr) {
        if(!timeStr) return "";
        let [hours, minutes] = timeStr.split(':');
        hours = parseInt(hours);
        let ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        return `${hours}:${minutes} ${ampm}`;
    },

    formatDateLabel(dateStr) {
        const d = new Date(dateStr);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return ` ${days[d.getDay()]} ,${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    },

    async submitForm(btn) {
        if (this._submittingForm) return;

        // Final Validation
        if (!this.state.currentReportId && this.state.points < 5 && this.state.subscriptionDays <= 0) {
            this.showToast("ليس لديك رصيد. تحتاج 5 نقاط لإصدار تقرير جديد.", "error");
            return;
        }

        const submitBtn = btn || document.getElementById('btn-submit-report');
        this._submittingForm = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.dataset.origText = submitBtn.innerHTML;
            submitBtn.innerHTML = '⏳ جاري الإصدار...';
        }

        // Show loading
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) loadingEl.style.display = 'flex';
        
        try {
            await this.populatePdfAndGenerate();
        } catch(e) {
            console.error(e);
            this.showToast("حدث خطأ أثناء إعداد التقرير: " + (e.message || e), "error");
        } finally {
            this._submittingForm = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitBtn.dataset.origText || 'إصدار التقرير';
            }
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    async populatePdfAndGenerate() {
        const type = this.state.leaveType;
        const admission = document.getElementById('admission_date').value;
        const discharge = document.getElementById('discharge_date').value;
        const duration = document.getElementById('duration').value;
        const issueDate = document.getElementById('issue_date').value;
        const issueTime = document.getElementById('issue_time').value;

        const pNameAr = document.getElementById('patient_name_ar').value;
        const pNameEn = document.getElementById('patient_name_en').value;
        const idNum = document.getElementById('national_id').value;
        const nationalityAr = document.getElementById('nationality').value;
        const natMap = {"أفغانستان":"Afghan","ألباني":"Albanian","الجزائر":"Algerian","الولايات المتحدة":"American","أندوري":"Andorran","أنغولي":"Angolan","أرجنتيني":"Argentine","أرميني":"Armenian","أستراليا":"Australian","نمساوي":"Austrian","أذربيجاني":"Azerbaijani","بهامي":"Bahamian","البحرين":"Bahraini","بنجلاديش":"Bangladeshi","بربادوسي":"Barbadian","بيلاروسي":"Belarusian","بلجيكي":"Belgian","بليزي":"Belizean","بنيني":"Beninese","بوتاني":"Bhutanese","بوليفي":"Bolivian","بوسني":"Bosnian","برازيلي":"Brazilian","بريطانيا":"British","بروني":"Bruneian","بلغاري":"Bulgarian","بوركيني":"Burkinabe","بوروندي":"Burundian","كمبودي":"Cambodian","كاميروني":"Cameroonian","كندا":"Canadian","الرأس الأخضر":"Cape Verdean","أفريقي أوسطي":"Central African","تشادي":"Chadian","تشيلي":"Chilean","صيني":"Chinese","كولومبي":"Colombian","قمري":"Comoran","كونغولي":"Congolese","كوستاريكي":"Costa Rican","كرواتي":"Croatian","كوبي":"Cuban","قبرصي":"Cypriot","تشيكي":"Czech","دنماركي":"Danish","جيبوتي":"Djiboutian","دومينيكاني":"Dominican","هولندي":"Dutch","تيموري شرقي":"East Timorese","إكوادوري":"Ecuadorean","مصر":"Egyptian","سلفادوري":"Salvadoran","غيني استوائي":"Equatorial Guinean","إريتريا":"Eritrean","إستوني":"Estonian","إثيوبيا":"Ethiopian","فيجي":"Fijian","فنلندي":"Finnish","فرنسي":"French","غابوني":"Gabonese","غامبي":"Gambian","جورجي":"Georgian","ألماني":"German","غاني":"Ghanaian","يوناني":"Greek","غرينادي":"Grenadian","غواتيمالي":"Guatemalan","غيني":"Guinean","غيني بيساوي":"Guinea-Bissauan","غوياني":"Guyanese","هايتي":"Haitian","هندوراسي":"Honduran","مجري":"Hungarian","أيسلندي":"Icelandic","الهند":"Indian","إندونيسيا":"Indonesian","إيران":"Iranian","العراق":"Iraqi","أيرلندي":"Irish","إسرائيلي":"Israeli","إيطالي":"Italian","إيفواري":"Ivorian","جامايكي":"Jamaican","ياباني":"Japanese","الأردن":"Jordanian","كازاخستاني":"Kazakhstani","كينيا":"Kenyan","كيريباتي":"I-Kiribati","كوري شمالي":"North Korean","كوري جنوبي":"South Korean","الكويت":"Kuwaiti","قرغيزي":"Kyrgyz","لاوسي":"Laotian","لاتفي":"Latvian","لبنان":"Lebanese","ليسوثي":"Mosotho","ليبيري":"Liberian","ليبيا":"Libyan","ليختنشتايني":"Liechtensteiner","ليتواني":"Lithuanian","لوكسمبورغي":"Luxembourger","مقدوني":"Macedonian","ملغاشي":"Malagasy","ملاوي":"Malawian","ماليزي":"Malaysian","ملديفي":"Maldivian","مالي":"Malian","مالطي":"Maltese","موريتاني":"Mauritanian","موريشيوسي":"Mauritian","مكسيكي":"Mexican","ميكرونيزي":"Micronesian","مولدوفي":"Moldovan","موناكي":"Monegasque","منغولي":"Mongolian","مونتينيغري":"Montenegrin","المغرب":"Moroccan","موزمبيقي":"Mozambican","ناميبي":"Namibian","ناوروي":"Nauruan","نيبال":"Nepalese","نيوزيلندي":"New Zealander","نيكاراغوي":"Nicaraguan","نيجري":"Nigerien","نيجيري":"Nigerian","عمان":"Omani","باكستان":"Pakistani","بالاوي":"Palauan","فلسطين":"Palestinian","بنمي":"Panamanian","بابوا غينيا الجديدة":"Papua New Guinean","باراغواياني":"Paraguayan","بيروفي":"Peruvian","الفلبين":"Philippine","بولندي":"Polish","برتغالي":"Portuguese","قطر":"Qatari","روماني":"Romanian","روسي":"Russian","رواندي":"Rwandan","لوسياني":"Saint Lucian","ساموي":"Samoan","السعودية / سعودي":"Saudi Arabia", "السعودية":"Saudi Arabia", "السعودية":"Saudi Arabian", "سعودية":"Saudi Arabian","سنغالي":"Senegalese","صربي":"Serbian","سيشلي":"Seychellois","سيراليوني":"Sierra Leonean","سنغافوري":"Singaporean","سلوفاكي":"Slovak","سلوفيني":"Slovenian","الصومال":"Somali","جنوب أفريقي":"South African","إسباني":"Spanish","سريلانكا":"Sri Lankan","السودان":"Sudanese","سورينامي":"Surinamer","سوازيلاندي":"Swazi","سويدي":"Swedish","سويسري":"Swiss","سوريا":"Syrian","تايواني":"Taiwanese","طاجيكي":"Tajik","تنزاني":"Tanzanian","تايلاندي":"Thai","توغولي":"Togolese","تونس":"Tunisian","تركيا":"Turkish","تركمانستاني":"Turkmen","أوغندا":"Ugandan","أوكراني":"Ukrainian","الإمارات":"Emirati","أوروغواياني":"Uruguayan","أوزبكستاني":"Uzbekistani","فنزويلي":"Venezuelan","فيتنامي":"Vietnamese","اليمن":"Yemeni","زامبي":"Zambian","زيمبابوي":"Zimbabwean"};
        const nationalityEn = natMap[nationalityAr] || nationalityAr;
        const employer = document.getElementById('employer').value;

        const docNameAr = document.getElementById('doctor_name_ar').value;
        const docNameEn = document.getElementById('doctor_name_en').value;
        const jobAr = document.getElementById('job_title_ar').value;
        const jobEn = document.getElementById('job_title_en').value;
        
        const hospAr = document.getElementById('hospital_ar').value;
        const hospEn = document.getElementById('hospital_en').value;
        const isPrivate = document.querySelector('input[name="hospital_type"]:checked').value === 'private';
        const license = document.getElementById('license_number').value;

        const leaveTypeValue = document.getElementById('leave_type').value || 'GSL';
        const dateObj = new Date(issueDate || Date.now());
        const yy = dateObj.getFullYear().toString().slice(2);
        const mm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const dd = dateObj.getDate().toString().padStart(2, '0');
        const seqId = Math.floor(Date.now() / 1000) % 100000;
        const obfuscatedId = (47313 * seqId + 15923) % 100000;
        const rand5 = obfuscatedId.toString().padStart(5, '0');
        const generatedId = `${leaveTypeValue}${yy}${mm}${dd}${rand5}`;
        const reportId = this.state.currentReportId || generatedId;

        const hijriAdm = this.getHijriDate(admission);
        const hijriDis = this.getHijriDate(discharge);
        const gregoAdm = this.formatGregorian(admission);
        const gregoDis = this.formatGregorian(discharge);

        const isCompanionType = (type === 'companion' || type === 'companion_review');
        const escAr = isCompanionType ? document.getElementById('escort_name_ar').value : '';
        const escEn = isCompanionType ? document.getElementById('escort_name_en').value : '';
        const relAr = isCompanionType ? document.getElementById('relation_ar').value : '';
        const relEn = isCompanionType ? document.getElementById('relation_en').value : '';

        let titleAr = 'تقرير إجازة مرضية';
        let titleEn = 'Sick Leave Report';
        if (type === 'companion') {
            titleAr = 'تقرير مرافقة مريض';
            titleEn = 'Patient Companion Report';
        } else if (type === 'companion_review') {
            titleAr = 'مشهد مراجعة لمرافق';
            titleEn = 'Companion Attendance Certificate';
        }

        const reportDataPayload = {
            titleAr: titleAr,
            titleEn: titleEn,
            leaveId: reportId,
            durationEn: `${duration} day ( ${gregoAdm} to ${gregoDis} )`,
            durationAr: `${duration} يوم ( <span dir="ltr">${hijriAdm}</span> الى <span dir="ltr">${hijriDis}</span> )`,
            admissionG: gregoAdm,
            admissionH: hijriAdm,
            dischargeG: gregoDis,
            dischargeH: hijriDis,
            issueDate: this.formatGregorian(issueDate),
            nameLabelEn: isCompanionType ? 'Companion Name' : 'Name',
            nameLabelAr: isCompanionType ? 'اسم المرافق' : 'الاسم',
            nameEn: isCompanionType ? escEn.toUpperCase() : pNameEn.toUpperCase(),
            nameAr: isCompanionType ? escAr : pNameAr,
            nationalId: idNum,
            nationalityEn: nationalityEn,
            nationalityAr: nationalityAr,
            relationEn: isCompanionType ? relEn : '',
            relationAr: isCompanionType ? relAr : '',
            employerEn: "",
            employerAr: employer || 'غير محدد',
            docLabelEn: isCompanionType ? 'Physician Name' : 'Practitioner Name',
            docLabelAr: isCompanionType ? 'اسم الطبيب المعالج' : 'اسم الممارس',
            doctorEn: docNameEn.toUpperCase(),
            doctorAr: docNameAr,
            positionEn: jobEn,
            positionAr: jobAr,
            hospitalAr: hospAr,
            hospitalEn: hospEn,
            hospitalLogoBase64: this.state.hospitalLogoUrl || null,
            licenseNumber: isPrivate ? license : '',
            time: this.formatAMPM(issueTime),
            dayDate: this.formatDateLabel(issueDate),
            type: type,
            patient_name_ar: pNameAr,
            patient_name_en: pNameEn,
            escort_name_ar: escAr,
            escort_name_en: escEn,
            relation_ar: relAr,
            relation_en: relEn
        };

        try {
            // SERVER-SIDE ATOMIC GENERATION & STORAGE (Rule 1 & Rule 14)
            const res = await fetch('/api/generate-native-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId: app.state.chatId,
                    reportData: reportDataPayload,
                    filename: 'sickLeaves.pdf',
                    reportId: reportId
                })
            });
            
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'فشل توليد التقرير');
            }

            // Sync updated points & days from server response
            if (data.points != null) app.state.points = data.points;
            if (data.daysRemaining != null) app.state.subscriptionDays = data.daysRemaining;
            
            if (data.report) {
                app.state.reports = [data.report, ...app.state.reports.filter(r => r.id !== reportId)];
            }

            app.updateDashboardUI();
            app.renderReports();

            document.getElementById('report-form').reset();
            // Keep the demo dataset applied when returning to the form in test mode
            if (this.state.testMode) this.applyTestData();
            app.navigate('success');

        } catch(e) {
            console.error("PDF Generation error: ", e);
            fetch('/api/logs?msg=' + encodeURIComponent('Client_Error: ' + e.message));
            this.showToast("حدث خطأ أثناء إصدار التقرير: " + e.message, "error");
        }
    },


    closeApp() {
        if(this.tg) {
            this.tg.close();
        } else {
            window.close();
        }
    }
};

window.onload = () => {
    app.init();

    // SECURITY: if the server rejects an admin request (401), the stored admin
    // token is stale/invalid — clear it so the user is asked to log in again.
    const _nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const response = await _nativeFetch(input, init);
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (response.status === 401 && url.indexOf('/api/admin/') !== -1) {
            localStorage.removeItem('sehaAdminToken');
            app.state.adminToken = null;
        }
        return response;
    };

    // Offline / Online Status Listeners (Rule 32)
    window.addEventListener('offline', () => {
        const banner = document.getElementById('offline-banner');
        if (banner) banner.style.display = 'block';
    });
    window.addEventListener('online', () => {
        const banner = document.getElementById('offline-banner');
        if (banner) banner.style.display = 'none';
        app.syncDataWithServer();
        if (document.getElementById('admin-screen')?.classList.contains('active')) {
            app.loadAdminData();
        }
    });
};

window.app = app;

