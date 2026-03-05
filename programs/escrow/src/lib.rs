use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("64korfZTbv6sZQyuxa5FandZsLBkdKMPHR39bnaPeAxc");

#[program]
pub mod blissnexus_escrow {
    use super::*;

    /// Initialize a new escrow for a task
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        task_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.requester = ctx.accounts.requester.key();
        escrow.task_id = task_id;
        escrow.amount = amount;
        escrow.agent = Pubkey::default();
        escrow.state = EscrowState::Funded;
        escrow.bump = ctx.bumps.escrow;

        // Transfer SOL to escrow PDA
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

        msg!("Escrow created: {} lamports locked", amount);
        Ok(())
    }

    /// Assign an agent to the escrow (when bid is accepted)
    pub fn assign_agent(
        ctx: Context<AssignAgent>,
        agent: Pubkey,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState);
        require!(escrow.requester == ctx.accounts.requester.key(), EscrowError::Unauthorized);
        
        escrow.agent = agent;
        escrow.state = EscrowState::Assigned;
        
        msg!("Agent assigned: {}", agent);
        Ok(())
    }

    /// Release funds to agent (requester approves result)
    pub fn release(ctx: Context<Release>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == EscrowState::Assigned || escrow.state == EscrowState::Funded,
            EscrowError::InvalidState
        );
        require!(escrow.requester == ctx.accounts.requester.key(), EscrowError::Unauthorized);
        require!(escrow.agent == ctx.accounts.agent.key(), EscrowError::WrongAgent);

        let amount = escrow.amount;
        escrow.state = EscrowState::Released;
        escrow.amount = 0;

        // Transfer from escrow PDA to agent
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Released {} lamports to agent", amount);
        Ok(())
    }

    /// Refund to requester (dispute or cancellation)
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == EscrowState::Funded || 
            escrow.state == EscrowState::Assigned ||
            escrow.state == EscrowState::Disputed,
            EscrowError::InvalidState
        );
        require!(escrow.requester == ctx.accounts.requester.key(), EscrowError::Unauthorized);

        let amount = escrow.amount;
        escrow.state = EscrowState::Refunded;
        escrow.amount = 0;

        // Transfer from escrow PDA back to requester
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.requester.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Refunded {} lamports to requester", amount);
        Ok(())
    }

    /// Mark escrow as disputed
    pub fn dispute(ctx: Context<Dispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == EscrowState::Assigned, EscrowError::InvalidState);
        require!(escrow.requester == ctx.accounts.requester.key(), EscrowError::Unauthorized);

        escrow.state = EscrowState::Disputed;
        msg!("Escrow disputed");
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32], amount: u64)]
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
pub struct AssignAgent<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    
    #[account(mut, has_one = requester)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    
    /// CHECK: Agent receives funds, validated against escrow.agent
    #[account(mut)]
    pub agent: AccountInfo<'info>,
    
    #[account(mut, has_one = requester)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    
    #[account(mut, has_one = requester)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Dispute<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    
    #[account(mut, has_one = requester)]
    pub escrow: Account<'info, Escrow>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub requester: Pubkey,
    pub agent: Pubkey,
    pub task_id: [u8; 32],
    pub amount: u64,
    pub state: EscrowState,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowState {
    Funded,
    Assigned,
    Released,
    Refunded,
    Disputed,
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow state for this operation")]
    InvalidState,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Wrong agent")]
    WrongAgent,
}
