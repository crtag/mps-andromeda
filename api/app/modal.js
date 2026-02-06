// Reusable modal system for consistent UI across the app

const Modal = {
    // Show confirmation dialog with Yes/No buttons
    confirm: function(title, message, onConfirm, onCancel) {
        const modal = this._createModal(title, message, [
            { text: 'Cancel', className: 'btn-secondary', onClick: onCancel || (() => {}) },
            { text: 'Confirm', className: 'btn-primary', onClick: onConfirm }
        ]);
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
    },

    // Show input dialog for text entry
    prompt: function(title, message, defaultValue, onSubmit, onCancel) {
        const inputId = 'modal-input-' + Date.now();
        const messageWithInput = `
            ${message ? `<p>${message}</p>` : ''}
            <input type="text" id="${inputId}" class="modal-input" value="${defaultValue || ''}" />
        `;

        const handleSubmit = () => {
            const input = document.getElementById(inputId);
            if (input) {
                onSubmit(input.value);
            }
        };

        const modal = this._createModal(title, messageWithInput, [
            { text: 'Cancel', className: 'btn-secondary', onClick: onCancel || (() => {}) },
            { text: 'Save', className: 'btn-primary', onClick: handleSubmit }
        ]);

        document.body.appendChild(modal);
        setTimeout(() => {
            modal.classList.add('show');
            const input = document.getElementById(inputId);
            if (input) {
                input.focus();
                input.select();
                // Handle Enter key
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        handleSubmit();
                        this._closeModal(modal);
                    }
                });
            }
        }, 10);
    },

    // Show warning dialog with Continue/Cancel buttons
    warning: function(title, message, onContinue, onCancel) {
        const modal = this._createModal(title, message, [
            { text: 'Continue Anyway', className: 'btn-secondary', onClick: onContinue },
            { text: 'Cancel', className: 'btn-primary', onClick: onCancel || (() => {}) }
        ], 'warning');
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
    },

    // Show alert dialog with single OK button
    alert: function(title, message, onOk) {
        const modal = this._createModal(title, message, [
            { text: 'OK', className: 'btn-primary', onClick: onOk || (() => {}) }
        ]);
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
    },

    // Internal: Create modal structure
    _createModal: function(title, message, buttons, type) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        const content = document.createElement('div');
        content.className = `modal-content ${type || ''}`;

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `<h3>${title}</h3>`;

        const body = document.createElement('div');
        body.className = 'modal-body';
        // For prompt dialogs with HTML (input fields), use innerHTML
        // For plain text messages, use textContent (XSS-safe)
        if (typeof message === 'string') {
            if (message.includes('<input')) {
                body.innerHTML = message;
            } else {
                body.textContent = message;
            }
        }

        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = btn.className;
            button.textContent = btn.text;
            button.onclick = () => {
                btn.onClick();
                this._closeModal(modal);
            };
            footer.appendChild(button);
        });

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this._closeModal(modal);
            }
        });

        return modal;
    },

    // Internal: Close and remove modal
    _closeModal: function(modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }
};
