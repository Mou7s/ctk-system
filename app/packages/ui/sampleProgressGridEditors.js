class SampleProgressInputEditor {
  constructor(data, saveCallback) {
    this.data = data
    this.saveCallback = saveCallback
    this.value = data?.value ?? ''
  }

  getValue() {
    return this.value
  }

  render(h) {
    return h('input', {
      type: this.inputType,
      value: this.value ?? '',
      step: this.inputType === 'number' ? 'any' : undefined,
      onInput: (event) => {
        this.value = event.target.value
      },
      onChange: (event) => {
        this.value = event.target.value
        this.saveCallback(this.value)
      },
    })
  }
}

export class SampleProgressDateEditor extends SampleProgressInputEditor {
  inputType = 'date'
}

export class SampleProgressNumberEditor extends SampleProgressInputEditor {
  inputType = 'number'
}
