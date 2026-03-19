/**
 * App.Utils.Validator
 * Client-side form/data validation utility.
 */

'use strict';

App.Utils.Validator = class Validator {

    constructor() {
        this._errors = {};
    }

    // -------------------------
    // Rule methods (chainable)
    // -------------------------

    required(field, value, label = null) {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            this._errors[field] = `${label || field} is required.`;
        }
        return this;
    }

    email(field, value, label = null) {
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (value && !pattern.test(value)) {
            this._errors[field] = `${label || field} must be a valid email address.`;
        }
        return this;
    }

    minLength(field, value, min, label = null) {
        if (value && value.length < min) {
            this._errors[field] = `${label || field} must be at least ${min} characters.`;
        }
        return this;
    }

    maxLength(field, value, max, label = null) {
        if (value && value.length > max) {
            this._errors[field] = `${label || field} must not exceed ${max} characters.`;
        }
        return this;
    }

    matches(field, value, other, label = null) {
        if (value !== other) {
            this._errors[field] = `${label || field} does not match.`;
        }
        return this;
    }

    numeric(field, value, label = null) {
        if (value && isNaN(Number(value))) {
            this._errors[field] = `${label || field} must be a number.`;
        }
        return this;
    }

    // -------------------------
    // Results
    // -------------------------

    passes() {
        return Object.keys(this._errors).length === 0;
    }

    fails() {
        return !this.passes();
    }

    errors() {
        return this._errors;
    }

    first(field) {
        return this._errors[field] || null;
    }

    reset() {
        this._errors = {};
        return this;
    }

    // -------------------------
    // jQuery form error display
    // -------------------------

    showErrors(formSelector) {
        $(formSelector).find('.field-error').remove();
        $(formSelector).find('.is-invalid').removeClass('is-invalid');

        for (const [field, message] of Object.entries(this._errors)) {
            const input = $(`[name="${field}"]`);
            input.addClass('is-invalid');
            input.after(`<span class="field-error text-danger small">${message}</span>`);
        }
    }

    clearErrors(formSelector) {
        $(formSelector).find('.field-error').remove();
        $(formSelector).find('.is-invalid').removeClass('is-invalid');
    }
};
