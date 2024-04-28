'use server';

import { signIn } from '@/auth';
import { sql } from '@vercel/postgres';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({ invalid_type_error: '请选择一个客户。' }),
  amount: z.coerce.number().gt(0, { message: '请输入一个大于$0的金额。' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: '请选择发票状态。',
  }),
  date: z.string(),
});
const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

// This is temporary until @types/react-dom is updated
export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};
export async function createInvoice(prevState: State, formData: FormData) {
  // 使用Zod验证表单字段
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
  // 如果表单验证失败，请尽早返回错误。否则，继续。
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: '缺少字段。无法创建发票。',
    };
  }
  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `;
  } catch (error) {
    return { message: '数据库错误：无法创建发票。' };
  }
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, formData: FormData) {
  const { customerId, amount, status } = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  const amountInCents = amount * 100;
  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
  } catch (error) {
    return { message: '数据库错误：无法更新发票。' };
  }
  // 示例缺少为该页清楚缓存
  revalidatePath(`/dashboard/invoices/${id}/edit`);
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}
export async function deleteInvoice(id: string) {
  throw new Error('Failed to Delete Invoice');
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
  } catch (error) {
    return { message: '数据库错误：删除发票失败。' };
  }
  revalidatePath('/dashboard/invoices');
}
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return '无效凭据。';
        default:
          return '出了问题。';
      }
    }
    throw error;
  }
}
