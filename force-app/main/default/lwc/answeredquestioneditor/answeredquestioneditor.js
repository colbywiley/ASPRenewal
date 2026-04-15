import { LightningElement, api, wire } from 'lwc';
import { FlowAttributeChangeEvent, FlowNavigationNextEvent } from 'lightning/flowSupport';
import getCustomQuestionInfo from '@salesforce/apex/AnsweredQuestionEditorController.getCustomQuestionInfo';

const NARROW_BREAKPOINT = 640;

export default class AnsweredQuestionEditor extends LightningElement {
    _inputAnsweredQuestions = [];
    _inputQuestionGroups = [];
    _editedRows = [];
    _groupNameMap = {};
    _cqInfoMap = {};
    _errorsByIndex = {};
    _initialized = false;
    _apexLoaded = false;
    _isNarrow = false;
    _resizeHandler = null;

    // ─── Lifecycle ────────────────────────────────────────────────
    connectedCallback() {
        this._resizeHandler = this._onResize.bind(this);
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this._resizeHandler);
            this._isNarrow = window.innerWidth < NARROW_BREAKPOINT;
        }
    }

    disconnectedCallback() {
        if (this._resizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this._resizeHandler = null;
    }

    renderedCallback() {
        this._syncHostClass();
        this._applyLayoutStyles();
        this._applyTextareaFont();
    }

    _onResize() {
        if (typeof window === 'undefined') return;
        const narrow = window.innerWidth < NARROW_BREAKPOINT;
        if (narrow !== this._isNarrow) {
            this._isNarrow = narrow;
        }
        // Always reapply — a no-op when nothing changed, but cheap and
        // guarantees the DOM reflects reality even if the reactive
        // re-render path is interrupted by the flow.
        this._syncHostClass();
        this._applyLayoutStyles();
    }

    _syncHostClass() {
        if (this.classList && typeof this.classList.toggle === 'function') {
            this.classList.toggle('is-narrow', this._isNarrow);
        }
    }

    // Directly apply the stacked-vs-table display on the DOM. Bypasses the
    // CSS cascade entirely so neither SLDS rules, LWC scope rewriting, nor
    // leftover inline styles can defeat it.
    _applyLayoutStyles() {
        const narrow = this._isNarrow;

        this.template.querySelectorAll('table').forEach(table => {
            table.style.width = '100%';
            if (narrow) {
                table.style.display = 'block';
                table.style.tableLayout = '';
            } else {
                table.style.display = '';
                table.style.tableLayout = 'fixed';
            }
        });

        this.template.querySelectorAll('tbody').forEach(tb => {
            tb.style.display = narrow ? 'block' : '';
            tb.style.width = narrow ? '100%' : '';
        });

        this.template.querySelectorAll('thead').forEach(th => {
            th.style.display = narrow ? 'none' : '';
        });

        this.template.querySelectorAll('tr').forEach(tr => {
            if (narrow) {
                tr.style.display = 'block';
                tr.style.width = '100%';
                tr.style.marginBottom = '0.75rem';
                tr.style.border = '1px solid #c9c9c9';
                tr.style.borderRadius = '0.25rem';
                tr.style.backgroundColor = '#fff';
            } else {
                tr.style.display = '';
                tr.style.width = '';
                tr.style.marginBottom = '';
                tr.style.border = '';
                tr.style.borderRadius = '';
                tr.style.backgroundColor = '';
            }
        });

        this.template.querySelectorAll('td').forEach(td => {
            td.style.whiteSpace = 'normal';
            td.style.wordWrap = 'break-word';
            td.style.overflowWrap = 'break-word';
            if (narrow) {
                td.style.display = 'block';
                td.style.width = '100%';
                td.style.maxWidth = 'none';
                td.style.padding = '0.5rem 0.75rem';
                td.style.border = 'none';
            } else {
                td.style.display = '';
                td.style.width = '';
                td.style.maxWidth = '0';
                td.style.padding = '';
                td.style.border = '';
            }
        });
    }

    _applyTextareaFont() {
        this.template.querySelectorAll('lightning-textarea').forEach(cmp => {
            const ta = cmp.shadowRoot && cmp.shadowRoot.querySelector('textarea');
            if (ta) {
                ta.style.fontFamily = "'Salesforce Sans', Arial, sans-serif";
                ta.style.fontSize = '0.875rem';
            }
        });
    }

    get rootClass() {
        return this._isNarrow
            ? 'slds-card slds-p-around_x-small is-narrow'
            : 'slds-card slds-p-around_medium';
    }

    // ─── Flow Inputs ──────────────────────────────────────────────
    @api
    get inputAnsweredQuestions() {
        return this._inputAnsweredQuestions;
    }
    set inputAnsweredQuestions(value) {
        this._inputAnsweredQuestions = value || [];
        this._tryInit();
    }

    @api
    get inputQuestionGroups() {
        return this._inputQuestionGroups;
    }
    set inputQuestionGroups(value) {
        this._inputQuestionGroups = value || [];
        this._buildGroupNameMap();
        this._tryInit();
    }

    // ─── Flow Output ──────────────────────────────────────────────
    @api
    get outputAnsweredQuestions() {
        return this._buildOutputCollection();
    }

    @api
    get outputAnsweredQuestionsWithIds() {
        return this._buildOutputCollectionWithIds();
    }

    // ─── Flow Validation ──────────────────────────────────────────
    // The component owns its own Next button (see handleNext). We keep this
    // @api method as a no-op stub so that if the Flow framework ever calls
    // it (e.g. the standard footer is still visible on a screen variant),
    // it never returns false — a false return causes the Flow to recreate
    // the LWC, which wipes user edits.
    @api
    validate() {
        return { isValid: true };
    }

    _computeErrors() {
        const nextErrors = {};
        this._editedRows.forEach(row => {
            if (row.isRequired && this._isRowEmpty(row)) {
                nextErrors[row.index] = 'This answer is required.';
            }
        });
        return nextErrors;
    }

    handleNext() {
        const nextErrors = this._computeErrors();
        this._errorsByIndex = nextErrors;

        if (Object.keys(nextErrors).length === 0) {
            // Push the latest values to the flow variables, then navigate.
            this._dispatchChange();
            this.dispatchEvent(new FlowNavigationNextEvent());
            return;
        }

        // Defer scroll/focus until the template has rendered the error state.
        Promise.resolve().then(() => this._scrollToFirstError());
    }

    _isRowEmpty(row) {
        if (row.isCheckbox) {
            // A required checkbox must be checked.
            return !row.checkboxValue;
        }
        if (row.isMultiSelectPicklist) {
            return !row.multiSelectValues || row.multiSelectValues.length === 0;
        }
        const value = row.currentValue;
        if (value === null || value === undefined) {
            return true;
        }
        return String(value).trim() === '';
    }

    _scrollToFirstError() {
        const errorCell = this.template.querySelector('[data-error="true"]');
        if (errorCell && typeof errorCell.scrollIntoView === 'function') {
            errorCell.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        const banner = this.template.querySelector('[data-error-banner="true"]');
        if (banner && typeof banner.scrollIntoView === 'function') {
            banner.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
        if (errorCell) {
            const input = errorCell.querySelector(
                'lightning-input, lightning-textarea, lightning-combobox, ' +
                'lightning-dual-listbox, lightning-radio-group'
            );
            if (input && typeof input.focus === 'function') {
                input.focus();
            }
        }
    }

    _clearErrorForRow(idx) {
        if (this._errorsByIndex[idx]) {
            const next = { ...this._errorsByIndex };
            delete next[idx];
            this._errorsByIndex = next;
        }
    }

    get hasAnyError() {
        return Object.keys(this._errorsByIndex).length > 0;
    }

    get invalidRowCount() {
        return Object.keys(this._errorsByIndex).length;
    }

    get invalidRowSummaries() {
        return this._editedRows
            .filter(r => this._errorsByIndex[r.index])
            .map(r => ({ key: r.key, label: r.questionLabel }));
    }

    // ─── Apex Wire: fetch custom question info ─────────────────
    get _customQuestionIds() {
        return this._inputAnsweredQuestions
            .filter(aq => aq.TREX1__aq_Custom_Question__c)
            .map(aq => aq.TREX1__aq_Custom_Question__c);
    }

    @wire(getCustomQuestionInfo, { customQuestionIds: '$_customQuestionIds' })
    wiredInfo({ error, data }) {
        if (data) {
            this._cqInfoMap = data;
            this._apexLoaded = true;
            this._tryInit();
        } else if (error) {
            this._apexLoaded = true;
            this._tryInit();
        }
    }

    // ─── Computed ─────────────────────────────────────────────────
    get hasRows() {
        return this._editedRows && this._editedRows.length > 0;
    }

    get isLoading() {
        return !this._apexLoaded && this._customQuestionIds.length > 0;
    }

    get groups() {
        if (!this._editedRows || this._editedRows.length === 0) {
            return [];
        }
        const groupMap = new Map();
        this._editedRows.forEach(row => {
            const groupName = row.groupName || 'Other';
            if (!groupMap.has(groupName)) {
                groupMap.set(groupName, {
                    key: `group-${groupName}`,
                    name: groupName,
                    rows: []
                });
            }
            const errorMessage = this._errorsByIndex[row.index] || '';
            groupMap.get(groupName).rows.push({
                ...row,
                hasError: !!errorMessage,
                errorMessage
            });
        });
        return Array.from(groupMap.values());
    }

    // ─── Build group Id → Name map ───────────────────────────────
    _buildGroupNameMap() {
        this._groupNameMap = {};
        this._inputQuestionGroups.forEach(group => {
            if (group.Id && group.Name) {
                this._groupNameMap[group.Id] = group.Name;
            }
        });
    }

    // ─── Init guard ──────────────────────────────────────────────
    _tryInit() {
        if (
            !this._initialized &&
            this._inputAnsweredQuestions.length > 0 &&
            this._apexLoaded
        ) {
            this._initialized = true;
            this._buildEditableRows();
        }
    }

    // ─── Build editable row models ───────────────────────────────
    _buildEditableRows() {
        this._editedRows = this._inputAnsweredQuestions.map((aq, index) => {
            const dataType = aq.TREX1__Data_Type__c || 'Text';
            const groupName = aq.TREX1__Question_Group_Name__c
                || this._groupNameMap[aq.TREX1__aq_Question_Group__c]
                || 'Other';
            const answer = aq.TREX1__Answer__c || '';

            // Get custom question info from Apex result
            const cqId = aq.TREX1__aq_Custom_Question__c;
            const cqInfo = (cqId && this._cqInfoMap[cqId]) ? this._cqInfoMap[cqId] : {};
            const optionsString = cqInfo.picklistOptions || '';
            const isRequired = cqInfo.required === true;

            const row = {
                key: `row-${index}`,
                index,
                questionLabel: aq.TREX1__Question__c || '(No question text)',
                groupName,
                dataType,
                currentValue: answer,
                originalRecord: aq,
                isRequired,

                // Type booleans for template rendering
                isCheckbox: dataType === 'Checkbox',
                isPicklist: dataType === 'Picklist',
                isMultiSelectPicklist: dataType === 'Multi-Select Picklist',
                isText: dataType === 'Text',
                isDate: dataType === 'Date',
                isMultipleChoice: dataType === 'Multiple Choice',
                isNumeric: dataType === 'Numeric',
                isTime: dataType === 'Time',
                isTextArea: dataType === 'TextArea',

                // Checkbox-specific
                checkboxValue: dataType === 'Checkbox' ? (answer.toLowerCase() === 'true') : false,

                // Picklist / Multi-Select / Multiple Choice options
                picklistOptions: [],
                multiSelectOptions: [],
                multipleChoiceOptions: [],

                // Multi-select values as array
                multiSelectValues: [],
            };

            // Build options from the Apex-fetched options string
            if (optionsString) {
                const opts = optionsString.split(';').map(o => o.trim()).filter(Boolean);
                const comboOptions = opts.map(o => ({ label: o, value: o }));

                if (row.isPicklist) {
                    row.picklistOptions = [{ label: '-- Select --', value: '' }, ...comboOptions];
                }
                if (row.isMultiSelectPicklist) {
                    row.multiSelectOptions = comboOptions;
                    row.multiSelectValues = answer ? answer.split(';').map(v => v.trim()).filter(Boolean) : [];
                    row.currentValue = row.multiSelectValues.join(';');
                }
                if (row.isMultipleChoice) {
                    row.multipleChoiceOptions = opts.map(o => ({
                        label: o,
                        value: o,
                        checked: answer === o
                    }));
                }
            }

            return row;
        });

        this._dispatchChange();
    }

    // ─── Event Handlers ───────────────────────────────────────────

    handleTextChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value;
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleNumericChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value != null ? String(event.target.value) : '';
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleDateChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value || '';
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleTimeChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value || '';
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleCheckboxChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        const checked = event.target.checked;
        this._editedRows[idx].checkboxValue = checked;
        this._editedRows[idx].currentValue = String(checked);
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handlePicklistChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.detail.value;
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleMultiSelectChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        const selectedValue = event.detail.value;
        this._editedRows[idx].currentValue = selectedValue;
        this._editedRows[idx].multiSelectValues = selectedValue ? selectedValue.split(';') : [];
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleMultipleChoiceChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        const selectedValue = event.target.value;
        this._editedRows[idx].currentValue = selectedValue;
        this._editedRows[idx].multipleChoiceOptions = this._editedRows[idx].multipleChoiceOptions.map(o => ({
            ...o,
            checked: o.value === selectedValue
        }));
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    handleTextAreaChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value;
        this._clearErrorForRow(idx);
        this._dispatchChange();
    }

    // ─── Output Builder ───────────────────────────────────────────
    _buildOutputCollection() {
        return this._editedRows.map(row => {
            const orig = row.originalRecord;
            const newRecord = {};

            for (const key of Object.keys(orig)) {
                if (key === 'Id') continue;
                newRecord[key] = orig[key];
            }

            newRecord.TREX1__Answer__c = row.currentValue;

            return newRecord;
        });
    }

    _buildOutputCollectionWithIds() {
        return this._editedRows.map(row => {
            const orig = row.originalRecord;
            const newRecord = {};

            for (const key of Object.keys(orig)) {
                newRecord[key] = orig[key];
            }

            newRecord.TREX1__Answer__c = row.currentValue;

            return newRecord;
        });
    }

    _dispatchChange() {
        this.dispatchEvent(new FlowAttributeChangeEvent('outputAnsweredQuestions', this._buildOutputCollection()));
        this.dispatchEvent(new FlowAttributeChangeEvent('outputAnsweredQuestionsWithIds', this._buildOutputCollectionWithIds()));
    }
}