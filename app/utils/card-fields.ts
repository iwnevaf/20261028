// 名刺の8項目（登録フォームと編集フォームで共通）
export type CardFields = {
  name: string
  companyName: string
  department: string
  title: string
  email: string
  phone: string
  address: string
  website: string
}

export const CARD_FIELD_DEFS: { key: keyof CardFields, label: string, type?: string, required?: boolean }[] = [
  { key: 'name', label: '氏名', required: true },
  { key: 'companyName', label: '会社名' },
  { key: 'department', label: '部署' },
  { key: 'title', label: '役職' },
  { key: 'email', label: 'メールアドレス', type: 'email' },
  { key: 'phone', label: '電話番号', type: 'tel' },
  { key: 'address', label: '住所' },
  { key: 'website', label: 'Webサイト' },
]

export const emptyCardFields = (): CardFields =>
  ({ name: '', companyName: '', department: '', title: '', email: '', phone: '', address: '', website: '' })
