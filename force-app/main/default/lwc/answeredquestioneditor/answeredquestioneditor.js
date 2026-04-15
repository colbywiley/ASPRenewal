import { LightningElement, api, wire } from 'lwc';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import getCustomQuestionInfo from '@salesforce/apex/AnsweredQuestionEditorController.getCustomQuestionInfo';

export default class AnsweredQuestionEditor extends LightningElement {
    _inputAnsweredQuestions = [];
    _inputQuestionGroups = [];
    _editedRows = [];
    _groupNameMap = {};
    _cqInfoMap = {};
    _initialized = false;
    _apexLoaded = false;
    _stylesApplied = false;

    // ─── Lifecycle ────────────────────────────────────────────────
    renderedCallback() {
        if (!this._stylesApplied && this._editedRows.length > 0) {
            this._stylesApplied = true;
            this._applyStyles();
        }
    }

    _applyStyles() {
        // Force table-layout fixed on all tables
        this.template.querySelectorAll('table').forEach(table => {
            table.style.tableLayout = 'fixed';
            table.style.width = '100%';
        });

        // Force word wrap on all table cells
        this.template.querySelectorAll('td').forEach(td => {
            td.style.whiteSpace = 'normal';
            td.style.wordWrap = 'break-word';
            td.style.overflowWrap = 'break-word';
            td.style.maxWidth = '0';
        });

        // Force font on textarea elements inside lightning-textarea
        this.template.querySelectorAll('lightning-textarea').forEach(cmp => {
            const ta = cmp.shadowRoot && cmp.shadowRoot.querySelector('textarea');
            if (ta) {
                ta.style.fontFamily = "'Salesforce Sans', Arial, sans-serif";
                ta.style.fontSize = '0.875rem';
            }
        });
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
    @api
    validate() {
        const allValid = [...this.template.querySelectorAll('[data-validate]')]
            .reduce((valid, cmp) => {
                if (cmp.reportValidity) {
                    return cmp.reportValidity() && valid;
                }
                return valid;
            }, true);

        if (allValid) {
            return { isValid: true };
        }
        return {
            isValid: false,
            errorMessage: 'Please correct the errors before proceeding.'
        };
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
            groupMap.get(groupName).rows.push(row);
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
        this._dispatchChange();
    }

    handleNumericChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value != null ? String(event.target.value) : '';
        this._dispatchChange();
    }

    handleDateChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value || '';
        this._dispatchChange();
    }

    handleTimeChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value || '';
        this._dispatchChange();
    }

    handleCheckboxChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        const checked = event.target.checked;
        this._editedRows[idx].checkboxValue = checked;
        this._editedRows[idx].currentValue = String(checked);
        this._dispatchChange();
    }

    handlePicklistChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.detail.value;
        this._dispatchChange();
    }

    handleMultiSelectChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        const selectedValue = event.detail.value;
        this._editedRows[idx].currentValue = selectedValue;
        this._editedRows[idx].multiSelectValues = selectedValue ? selectedValue.split(';') : [];
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
        this._dispatchChange();
    }

    handleTextAreaChange(event) {
        const idx = parseInt(event.target.dataset.index, 10);
        this._editedRows[idx].currentValue = event.target.value;
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