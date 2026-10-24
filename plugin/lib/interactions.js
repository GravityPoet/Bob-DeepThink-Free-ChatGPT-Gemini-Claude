// Gemini Interactions v1 steps and SSE events. Signatures are never display text.
function contentText(content) {
    var parts = Array.isArray(content) ? content : [content];
    return parts.map(function (part) { return part && part.type === 'text' && typeof part.text === 'string' ? part.text : ''; }).join('');
}

function text(data) {
    return Array.isArray(data.steps) ? data.steps.filter(function (step) { return step.type === 'model_output'; })
        .map(function (step) { return contentText(step.content); }).filter(Boolean).join('\n\n') : '';
}

function thinking(data) {
    return Array.isArray(data.steps) ? data.steps.filter(function (step) { return step.type === 'thought'; })
        .map(function (step) { return contentText(step.summary); }).filter(Boolean).join('\n\n') : '';
}

function update(event, state) {
    if (event.type !== 'step.start' && event.type !== 'step.delta') return false;
    var index = event.index;
    if (typeof index !== 'number' || index < 0 || index > 10000 || index % 1 !== 0) throw new Error('无效的 Interactions 步骤编号');
    var steps = state.interactionSteps || (state.interactionSteps = Object.create(null));
    var part = steps[index];
    if (event.type === 'step.start') {
        var step = event.step || {};
        part = { kind: step.type, text: contentText(step.content), thinking: contentText(step.summary) };
        steps[index] = part;
    } else {
        var delta = event.delta || {};
        if (!part) part = steps[index] = { kind: delta.type === 'thought_summary' ? 'thought' : 'model_output', text: '', thinking: '' };
        if (delta.type === 'text' && part.kind === 'model_output') part.text += typeof delta.text === 'string' ? delta.text : '';
        if (delta.type === 'thought_summary') part.thinking += contentText(delta.content);
    }
    var ordered = Object.keys(steps).sort(function (a, b) { return Number(a) - Number(b); }).map(function (key) { return steps[key]; });
    var answer = ordered.filter(function (item) { return item.kind === 'model_output'; }).map(function (item) { return item.text; }).filter(Boolean).join('\n\n');
    var thought = ordered.filter(function (item) { return item.kind === 'thought'; }).map(function (item) { return item.thinking; }).filter(Boolean).join('\n\n');
    var changed = answer !== state.text || thought !== state.thinkText;
    state.text = answer; state.thinkText = thought;
    return changed;
}

module.exports = { text: text, thinking: thinking, update: update };
