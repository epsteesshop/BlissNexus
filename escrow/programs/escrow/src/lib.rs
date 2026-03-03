use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("7vNFHULaw8fmnCZPZ5GDFhWovUixe769qzupuqSA7kjw"); // Will be updated after build

#[program]
pub mod blissnexus_escrow {
    use super::*;

    /// Create a new task escrow - locks funds until task completion
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        task_id: [u8; 32],
        amount: u64,
        worker: Pubkey,
    ) -> Result<()> {
        // Transfer SOL from requester to escrow PDA first
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.requester.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        // Then set escrow fields
        let escrow = &mut ctx.accounts.escrow;
        escrow.requester = ctx.accounts.requester.key();
        escrow.worker = worker;
        escrow.task_id = task_id;
        escrow.amount = amount;
        escrow.status = EscrowStatus::Active;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.escrow;

        emit!(EscrowCreated {
            task_id,
            requester: escrow.requester,
            worker,
            amount,
        });

        Ok(())
    }

    /// Release funds to worker - called when task is completed
    pub fn release(ctx: Context<Release>, task_id: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        require!(escrow.status == EscrowStatus::Active, EscrowError::NotActive);
        require!(escrow.task_id == task_id, EscrowError::TaskMismatch);

        let amount = escrow.amount;
        escrow.status = EscrowStatus::Released;

        // Transfer from escrow PDA to worker
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.worker.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(EscrowReleased {
            task_id,
            worker: ctx.accounts.worker.key(),
            amount,
        });

        Ok(())
    }

    /// Refund to requester - called if task is cancelled
    pub fn refund(ctx: Context<Refund>, task_id: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        require!(escrow.status == EscrowStatus::Active, EscrowError::NotActive);
        require!(escrow.task_id == task_id, EscrowError::TaskMismatch);

        let amount = escrow.amount;
        escrow.status = EscrowStatus::Refunded;

        // Transfer from escrow PDA back to requester
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.requester.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(EscrowRefunded {
            task_id,
            requester: ctx.accounts.requester.key(),
            amount,
        });

        Ok(())
    }

    /// Dispute resolution - admin can release or refund
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        task_id: [u8; 32],
        release_to_worker: bool,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        require!(escrow.status == EscrowStatus::Active, EscrowError::NotActive);
        require!(escrow.task_id == task_id, EscrowError::TaskMismatch);

        let amount = escrow.amount;

        if release_to_worker {
            escrow.status = EscrowStatus::Released;
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
            **ctx.accounts.worker.to_account_info().try_borrow_mut_lamports()? += amount;
        } else {
            escrow.status = EscrowStatus::Refunded;
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
            **ctx.accounts.requester.to_account_info().try_borrow_mut_lamports()? += amount;
        }

        emit!(DisputeResolved {
            task_id,
            release_to_worker,
            amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    
    #[account(
        init,
        payer = requester,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", task_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct Release<'info> {
    /// Requester must sign to release
    #[account(constraint = requester.key() == escrow.requester)]
    pub requester: Signer<'info>,
    
    /// CHECK: Worker receives payment
    #[account(mut, constraint = worker.key() == escrow.worker)]
    pub worker: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", task_id.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct Refund<'info> {
    /// Worker must sign to allow refund
    #[account(constraint = worker.key() == escrow.worker)]
    pub worker: Signer<'info>,
    
    /// CHECK: Requester receives refund
    #[account(mut, constraint = requester.key() == escrow.requester)]
    pub requester: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", task_id.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct ResolveDispute<'info> {
    /// Admin authority
    pub admin: Signer<'info>,
    
    /// CHECK: Worker account
    #[account(mut, constraint = worker.key() == escrow.worker)]
    pub worker: AccountInfo<'info>,
    
    /// CHECK: Requester account
    #[account(mut, constraint = requester.key() == escrow.requester)]
    pub requester: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", task_id.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub requester: Pubkey,
    pub worker: Pubkey,
    pub task_id: [u8; 32],
    pub amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
}

#[error_code]
pub enum EscrowError {
    #[msg("Escrow is not active")]
    NotActive,
    #[msg("Task ID mismatch")]
    TaskMismatch,
}

#[event]
pub struct EscrowCreated {
    pub task_id: [u8; 32],
    pub requester: Pubkey,
    pub worker: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowReleased {
    pub task_id: [u8; 32],
    pub worker: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowRefunded {
    pub task_id: [u8; 32],
    pub requester: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DisputeResolved {
    pub task_id: [u8; 32],
    pub release_to_worker: bool,
    pub amount: u64,
}
